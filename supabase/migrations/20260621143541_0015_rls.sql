-- M0 / T031: row-level security, role least-privilege, aal2, admin-only audit.
--
-- Model: GRANTs open the door per DB role (anon/authenticated); RLS policies
-- filter rows. We use plain ENABLE (NOT FORCE) on purpose: the superuser (seed,
-- migrations), service_role, and every SECURITY DEFINER trigger (audit_trigger,
-- notify_from_audit, enforce_review_transition, current_role_name,
-- handle_new_auth_user_profile) must bypass RLS — FORCE would break audit writes
-- and seeding. Do not add FORCE.
--
-- aal2 (2FA) is required for every write/review/admin action; ordinary
-- authentication is not enough (auth.jwt()->>'aal' must equal 'aal2').

-- ---------------------------------------------------------------------------
-- Helpers (stable; current_role_name is SECURITY DEFINER so it reads profiles
-- regardless of the caller's RLS).
-- ---------------------------------------------------------------------------
create or replace function public.is_aal2()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.current_role_name() in ('author', 'shariah_reviewer', 'editor', 'admin');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select public.current_role_name() = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Integrity trigger fix: enforce_claim_submission_requirements (0007) reads
-- claim_citations/citations/doc_grades and was SECURITY INVOKER. Under RLS it
-- would see only the caller's visible rows and could spuriously reject a valid
-- submission. An integrity check must see all rows -> make it SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_claim_submission_requirements()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_requires_grading_source boolean;
  v_has_live_citation boolean;
  v_has_grading_source boolean;
begin
  if new.review_status_code not in ('submitted', 'shariah_approved', 'approved', 'published') then
    return new;
  end if;

  select exists (
    select 1 from public.claim_citations cc
    where cc.claim_id = new.id and cc.deleted_at is null
  ) into v_has_live_citation;

  if not v_has_live_citation then
    raise exception 'submitted claim requires at least one live citation';
  end if;

  select coalesce(dg.requires_grading_source, false)
  into v_requires_grading_source
  from public.doc_grades dg
  where dg.code = new.doc_grade_code;

  if v_requires_grading_source then
    select exists (
      select 1
      from public.claim_citations cc
      join public.citations c on c.id = cc.citation_id
      where cc.claim_id = new.id
        and cc.deleted_at is null
        and c.deleted_at is null
        and c.grading_source is not null
        and btrim(c.grading_source) <> ''
    ) into v_has_grading_source;

    if not v_has_grading_source then
      raise exception 'claim grade % requires a citation with grading_source', new.doc_grade_code;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on every table (plain ENABLE).
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  v_all text[] := array[
    'languages','roles','review_states','doc_grades','confidence_levels','claim_types',
    'citation_relations','source_types','source_statuses','note_types','lookup_labels','review_transitions',
    'profiles','sources','citations','locations','events','persons','claims','claim_citations',
    'event_persons','event_locations','content_notes',
    'event_translations','person_translations','location_translations','claim_translations',
    'audit_log','notification_outbox'
  ];
begin
  foreach t in array v_all loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- GRANTs (RLS filters rows; no DELETE grant — soft delete is an UPDATE).
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on
  public.languages, public.roles, public.review_states, public.doc_grades,
  public.confidence_levels, public.claim_types, public.citation_relations,
  public.source_types, public.source_statuses, public.note_types, public.lookup_labels,
  public.events, public.persons, public.locations, public.claims,
  public.event_translations, public.person_translations, public.location_translations, public.claim_translations,
  public.sources, public.citations, public.event_persons, public.event_locations
to anon, authenticated;

grant select on
  public.content_notes, public.audit_log, public.notification_outbox,
  public.review_transitions, public.profiles
to authenticated;

grant insert, update on
  public.events, public.persons, public.locations, public.claims,
  public.event_translations, public.person_translations, public.location_translations, public.claim_translations,
  public.sources, public.citations, public.event_persons, public.event_locations,
  public.content_notes
to authenticated;

grant update on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- Policies.
-- ---------------------------------------------------------------------------

-- Reference lookups: world-readable; writes are superuser/service-role only.
do $$
declare
  t text;
  v_lookups text[] := array[
    'languages','roles','review_states','doc_grades','confidence_levels','claim_types',
    'citation_relations','source_types','source_statuses','note_types','lookup_labels'
  ];
begin
  foreach t in array v_lookups loop
    execute format('create policy %1$s_read on public.%1$I for select to anon, authenticated using (true)', t);
  end loop;
end;
$$;

-- Structure content: anon sees published; staff see all; staff+aal2 write.
do $$
declare
  t text;
  v_content text[] := array['events','persons','locations','claims'];
begin
  foreach t in array v_content loop
    execute format('create policy %1$s_read_visible on public.%1$I for select to anon, authenticated using (review_status_code = ''published'' and deleted_at is null)', t);
    execute format('create policy %1$s_read_staff on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy %1$s_write_insert on public.%1$I for insert to authenticated with check (public.is_staff() and public.is_aal2())', t);
    execute format('create policy %1$s_write_update on public.%1$I for update to authenticated using (public.is_staff() and public.is_aal2()) with check (public.is_staff() and public.is_aal2())', t);
  end loop;
end;
$$;

-- Translations: anon sees published rows whose parent structure is published.
do $$
declare
  t text;
  v_entity text;
  v_parent text;
  v_fk text;
  v_trs text[] := array['event_translations','person_translations','location_translations','claim_translations'];
begin
  foreach t in array v_trs loop
    v_entity := replace(t, '_translations', '');
    v_parent := v_entity || 's';
    v_fk := v_entity || '_id';
    execute format(
      'create policy %1$s_read_visible on public.%1$I for select to anon, authenticated using (
         review_status_code = ''published'' and deleted_at is null
         and exists (select 1 from public.%2$I p where p.id = %1$I.%3$I
                       and p.review_status_code = ''published'' and p.deleted_at is null))',
      t, v_parent, v_fk);
    execute format('create policy %1$s_read_staff on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy %1$s_write_insert on public.%1$I for insert to authenticated with check (public.is_staff() and public.is_aal2())', t);
    execute format('create policy %1$s_write_update on public.%1$I for update to authenticated using (public.is_staff() and public.is_aal2()) with check (public.is_staff() and public.is_aal2())', t);
  end loop;
end;
$$;

-- Sources: anon sees approved; staff see all; staff+aal2 write.
create policy sources_read_visible on public.sources for select to anon, authenticated
  using (status_code = 'approved' and deleted_at is null);
create policy sources_read_staff on public.sources for select to authenticated using (public.is_staff());
create policy sources_write_insert on public.sources for insert to authenticated
  with check (public.is_staff() and public.is_aal2());
create policy sources_write_update on public.sources for update to authenticated
  using (public.is_staff() and public.is_aal2()) with check (public.is_staff() and public.is_aal2());

-- Citations: anon sees those of an approved source; staff see all; staff+aal2 write.
create policy citations_read_visible on public.citations for select to anon, authenticated
  using (deleted_at is null and exists (
    select 1 from public.sources s where s.id = citations.source_id
      and s.status_code = 'approved' and s.deleted_at is null));
create policy citations_read_staff on public.citations for select to authenticated using (public.is_staff());
create policy citations_write_insert on public.citations for insert to authenticated
  with check (public.is_staff() and public.is_aal2());
create policy citations_write_update on public.citations for update to authenticated
  using (public.is_staff() and public.is_aal2()) with check (public.is_staff() and public.is_aal2());

-- Join tables: anon sees rows whose event is published; staff see all; staff+aal2 write.
do $$
declare
  t text;
  v_joins text[] := array['event_persons','event_locations'];
begin
  foreach t in array v_joins loop
    execute format(
      'create policy %1$s_read_visible on public.%1$I for select to anon, authenticated using (
         deleted_at is null and exists (select 1 from public.events e where e.id = %1$I.event_id
           and e.review_status_code = ''published'' and e.deleted_at is null))', t);
    execute format('create policy %1$s_read_staff on public.%1$I for select to authenticated using (public.is_staff())', t);
    execute format('create policy %1$s_write_insert on public.%1$I for insert to authenticated with check (public.is_staff() and public.is_aal2())', t);
    execute format('create policy %1$s_write_update on public.%1$I for update to authenticated using (public.is_staff() and public.is_aal2()) with check (public.is_staff() and public.is_aal2())', t);
  end loop;
end;
$$;

-- content_notes: internal — staff only (no anon); staff+aal2 write.
create policy content_notes_read_staff on public.content_notes for select to authenticated using (public.is_staff());
create policy content_notes_write_insert on public.content_notes for insert to authenticated
  with check (public.is_staff() and public.is_aal2());
create policy content_notes_write_update on public.content_notes for update to authenticated
  using (public.is_staff() and public.is_aal2()) with check (public.is_staff() and public.is_aal2());

-- audit_log + notification_outbox: admin-only read. No write policy — only
-- SECURITY DEFINER triggers / service_role write (they bypass RLS).
create policy audit_log_read_admin on public.audit_log for select to authenticated using (public.is_admin());
create policy notification_outbox_read_admin on public.notification_outbox for select to authenticated using (public.is_admin());

-- review_transitions: admin-only read (the enforce trigger reads it as definer).
create policy review_transitions_read_admin on public.review_transitions for select to authenticated using (public.is_admin());

-- profiles: a user reads their own row; admin reads all and changes roles (aal2).
create policy profiles_read_self_or_admin on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin() and public.is_aal2()) with check (public.is_admin() and public.is_aal2());
