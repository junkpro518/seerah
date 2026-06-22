-- M0 / T030: row-level security, role least-privilege, aal2, admin-only audit.
-- RED until 0015 enables RLS + policies + grants.

-- True once RLS is enabled on the content tables (guards behavioural tests so
-- they fail cleanly, not by permission errors, before the migration exists).
create or replace function test_helpers.rls_active()
returns boolean
language sql
stable
as $$
  select coalesce((select relrowsecurity from pg_class where oid = 'public.events'::regclass), false);
$$;

create or replace function test_helpers.rls_enabled_on(p_tables text[])
returns boolean
language plpgsql
as $$
declare
  t text;
begin
  foreach t in array p_tables loop
    if not coalesce((select relrowsecurity from pg_class where oid = ('public.' || quote_ident(t))::regclass), false) then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- Authenticate as a real staff member: a profile carrying p_role, jwt sub set,
-- aal claim p_aal, DB role switched to authenticated so RLS applies.
create or replace function test_helpers.become(p_role text, p_aal text default 'aal2')
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  v_id := test_helpers.create_role_user(p_role);   -- runs as postgres (definer)
  perform test_helpers.set_jwt_claims(v_id, 'authenticated', p_aal);
  set local role authenticated;
  return v_id;
end;
$$;

-- Leave one content_published row in the outbox (state machine sees admin via jwt;
-- runs as postgres so RLS is bypassed for the setup).
create or replace function test_helpers.enqueue_one_outbox()
returns void
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;
  perform test_helpers.seed_to_state('public.events'::regclass, v_id, 'approved');
  perform test_helpers.set_jwt_claims(test_helpers.create_role_user('admin'));
  update public.events set review_status_code = 'published' where id = v_id;
  perform test_helpers.reset_auth_context();
end;
$$;

create or replace function test_helpers.anon_cannot_see_draft()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  perform test_helpers.as_anon();
  select count(*) into v_count from public.events where id = v_id;
  perform test_helpers.reset_auth_context();
  return v_count = 0;
end;
$$;

create or replace function test_helpers.anon_can_see_published()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;
  perform test_helpers.seed_to_state('public.events'::regclass, v_id, 'published');

  perform test_helpers.as_anon();
  select count(*) into v_count from public.events where id = v_id;
  perform test_helpers.reset_auth_context();
  return v_count = 1;
end;
$$;

create or replace function test_helpers.anon_cannot_insert()
returns boolean
language plpgsql
as $$
begin
  if not test_helpers.rls_active() then return false; end if;

  perform test_helpers.as_anon();
  begin
    insert into public.events (timeline_order) values (floor(random() * 100000000)::integer);
    perform test_helpers.reset_auth_context();
    return false;
  exception when insufficient_privilege then
    perform test_helpers.reset_auth_context();
    return true;
  end;
end;
$$;

create or replace function test_helpers.anon_sees_approved_source_only()
returns boolean
language plpgsql
as $$
declare
  v_prop uuid;
  v_appr uuid;
  v_prop_c integer;
  v_appr_c integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('rls-proposed-' || gen_random_uuid(), 'مقترح', 'hadith', 'proposed')
  returning id into v_prop;
  insert into public.sources (slug, title, source_type_code, status_code)
  values ('rls-approved-' || gen_random_uuid(), 'معتمد', 'hadith', 'approved')
  returning id into v_appr;

  perform test_helpers.as_anon();
  select count(*) into v_prop_c from public.sources where id = v_prop;
  select count(*) into v_appr_c from public.sources where id = v_appr;
  perform test_helpers.reset_auth_context();

  return v_prop_c = 0 and v_appr_c = 1;
end;
$$;

create or replace function test_helpers.aal1_write_rejected()
returns boolean
language plpgsql
as $$
begin
  if not test_helpers.rls_active() then return false; end if;

  perform test_helpers.become('author', 'aal1');
  begin
    insert into public.events (timeline_order) values (floor(random() * 100000000)::integer);
    perform test_helpers.reset_auth_context();
    return false;
  exception when insufficient_privilege then
    perform test_helpers.reset_auth_context();
    return true;
  end;
end;
$$;

create or replace function test_helpers.aal2_write_allowed()
returns boolean
language plpgsql
as $$
begin
  if not test_helpers.rls_active() then return false; end if;

  perform test_helpers.become('author', 'aal2');
  begin
    insert into public.events (timeline_order) values (floor(random() * 100000000)::integer);
    perform test_helpers.reset_auth_context();
    return true;
  exception when others then
    perform test_helpers.reset_auth_context();
    return false;
  end;
end;
$$;

create or replace function test_helpers.staff_sees_draft()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  perform test_helpers.become('editor', 'aal2');
  select count(*) into v_count from public.events where id = v_id;
  perform test_helpers.reset_auth_context();
  return v_count = 1;
end;
$$;

create or replace function test_helpers.audit_not_readable_by_non_admin()
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order) values (floor(random() * 100000000)::integer);

  perform test_helpers.become('editor', 'aal2');
  select count(*) into v_count from public.audit_log;
  perform test_helpers.reset_auth_context();
  return v_count = 0;
end;
$$;

create or replace function test_helpers.audit_readable_by_admin()
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order) values (floor(random() * 100000000)::integer);

  perform test_helpers.become('admin', 'aal2');
  select count(*) into v_count from public.audit_log;
  perform test_helpers.reset_auth_context();
  return v_count > 0;
end;
$$;

create or replace function test_helpers.outbox_not_readable_by_non_admin()
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  perform test_helpers.enqueue_one_outbox();

  perform test_helpers.become('editor', 'aal2');
  select count(*) into v_count from public.notification_outbox;
  perform test_helpers.reset_auth_context();
  return v_count = 0;
end;
$$;

create or replace function test_helpers.outbox_readable_by_admin()
returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  perform test_helpers.enqueue_one_outbox();

  perform test_helpers.become('admin', 'aal2');
  select count(*) into v_count from public.notification_outbox;
  perform test_helpers.reset_auth_context();
  return v_count > 0;
end;
$$;

create or replace function test_helpers.content_notes_hidden_from_anon()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;
  insert into public.content_notes (event_id, note_type_code, body)
  values (v_event_id, 'editorial_note', 'ملاحظة داخلية');

  perform test_helpers.as_anon();
  begin
    perform 1 from public.content_notes limit 1;
    perform test_helpers.reset_auth_context();
    return false;
  exception when insufficient_privilege then
    perform test_helpers.reset_auth_context();
    return true;
  end;
end;
$$;

create or replace function test_helpers.translation_hidden_when_parent_draft()
returns boolean
language plpgsql
as $$
declare
  v_ev uuid;
  v_tr uuid;
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_ev;  -- parent stays draft
  insert into public.event_translations (event_id, lang, body)
  values (v_ev, 'ar', '{}'::jsonb)
  returning id into v_tr;
  perform test_helpers.seed_to_state('public.event_translations'::regclass, v_tr, 'published');

  perform test_helpers.as_anon();
  select count(*) into v_count from public.event_translations where id = v_tr;
  perform test_helpers.reset_auth_context();
  return v_count = 0;
end;
$$;

create or replace function test_helpers.translation_visible_when_parent_published()
returns boolean
language plpgsql
as $$
declare
  v_ev uuid;
  v_tr uuid;
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_ev;
  perform test_helpers.seed_to_state('public.events'::regclass, v_ev, 'published');
  insert into public.event_translations (event_id, lang, body)
  values (v_ev, 'ar', '{}'::jsonb)
  returning id into v_tr;
  perform test_helpers.seed_to_state('public.event_translations'::regclass, v_tr, 'published');

  perform test_helpers.as_anon();
  select count(*) into v_count from public.event_translations where id = v_tr;
  perform test_helpers.reset_auth_context();
  return v_count = 1;
end;
$$;

-- SC-008: an unpublished translation must not appear, even under a published parent.
create or replace function test_helpers.unpublished_translation_hidden_from_anon()
returns boolean
language plpgsql
as $$
declare
  v_ev uuid;
  v_tr uuid;
  v_count integer;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_ev;
  perform test_helpers.seed_to_state('public.events'::regclass, v_ev, 'published');  -- parent published
  insert into public.event_translations (event_id, lang, body)
  values (v_ev, 'ar', '{}'::jsonb)
  returning id into v_tr;
  perform test_helpers.seed_to_state('public.event_translations'::regclass, v_tr, 'approved');  -- translation not published

  perform test_helpers.as_anon();
  select count(*) into v_count from public.event_translations where id = v_tr;
  perform test_helpers.reset_auth_context();
  return v_count = 0;
end;
$$;

-- SC-009: no physical delete — app roles have no DELETE grant (soft delete only).
create or replace function test_helpers.physical_delete_blocked_for_staff()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  if not test_helpers.rls_active() then return false; end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  perform test_helpers.become('editor', 'aal2');
  begin
    delete from public.events where id = v_id;
    perform test_helpers.reset_auth_context();
    return false;
  exception when insufficient_privilege then
    perform test_helpers.reset_auth_context();
    return true;
  end;
end;
$$;

select plan(17);

select ok(
  test_helpers.rls_enabled_on(array['events','persons','locations','claims','sources','citations',
    'event_translations','content_notes','audit_log','notification_outbox','review_transitions','profiles']),
  'RLS enabled on all core tables'
);
select ok(test_helpers.anon_cannot_see_draft(), 'anon cannot see a draft event');
select ok(test_helpers.anon_can_see_published(), 'anon can see a published event');
select ok(test_helpers.anon_cannot_insert(), 'anon cannot insert (42501)');
select ok(test_helpers.anon_sees_approved_source_only(), 'anon sees approved sources only');
select ok(test_helpers.aal1_write_rejected(), 'write without aal2 is rejected (42501)');
select ok(test_helpers.aal2_write_allowed(), 'write with aal2 by staff is allowed');
select ok(test_helpers.staff_sees_draft(), 'staff (editor) can see drafts');
select ok(test_helpers.audit_not_readable_by_non_admin(), 'audit_log not readable by non-admin');
select ok(test_helpers.audit_readable_by_admin(), 'audit_log readable by admin');
select ok(test_helpers.outbox_not_readable_by_non_admin(), 'notification_outbox not readable by non-admin');
select ok(test_helpers.outbox_readable_by_admin(), 'notification_outbox readable by admin');
select ok(test_helpers.content_notes_hidden_from_anon(), 'content_notes not readable by anon');
select ok(test_helpers.translation_hidden_when_parent_draft(), 'published translation hidden from anon when parent is draft');
select ok(test_helpers.translation_visible_when_parent_published(), 'published translation visible to anon when parent is published');
select ok(test_helpers.unpublished_translation_hidden_from_anon(), 'SC-008: unpublished translation hidden from anon even under a published parent');
select ok(test_helpers.physical_delete_blocked_for_staff(), 'SC-009: physical DELETE blocked for staff (soft delete only)');

select * from finish();
