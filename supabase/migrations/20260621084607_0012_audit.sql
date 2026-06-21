-- M0 / T027: comprehensive append-only audit trail.
-- A generic AFTER trigger records every data change (full OLD/NEW jsonb) on all
-- modifiable tables. Append-only is enforced by triggers (not RLS): UPDATE/DELETE
-- on audit_log are always rejected, and direct INSERT is rejected — only
-- audit_trigger() may write, gated by a transaction-local context flag.
--
-- Deferred (recorded intentions, not silently dropped):
--   * SELECT restriction (admin-only) is enforced in 0014 (RLS, phase 8). The
--     log holds full row values, so reads are admin-only by design.
--   * Admin LOGIN/LOGOUT auditing (op = 'LOGIN'/'LOGOUT') is captured outside
--     pgTAP via a Supabase Auth Hook that inserts an audit_log row; it is wired
--     in a later phase (not testable in the local pgTAP loop). data-model §9.

create table public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,
  op text not null,
  old_data jsonb,
  new_data jsonb,
  actor uuid,
  actor_role text,
  occurred_at timestamptz not null default now()
);

create index audit_log_table_row_idx on public.audit_log (table_name, row_id);
create index audit_log_occurred_at_idx on public.audit_log (occurred_at);

-- The only legitimate writer. SECURITY DEFINER so it can write regardless of the
-- caller's privileges/RLS; sets app.audit_ctx so the insert guard lets it through.
create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_row_id text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
    v_row_id := v_old ->> 'id';
  elsif tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
    v_row_id := v_new ->> 'id';
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row_id := v_new ->> 'id';
  end if;

  perform set_config('app.audit_ctx', '1', true);
  insert into public.audit_log (table_name, row_id, op, old_data, new_data, actor, actor_role)
  values (tg_table_name, v_row_id, tg_op, v_old, v_new, auth.uid(), public.current_role_name());
  perform set_config('app.audit_ctx', '', true);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Append-only guards on audit_log.
create or replace function public.prevent_audit_log_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op;
end;
$$;

create or replace function public.guard_audit_log_insert()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.audit_ctx', true) is distinct from '1' then
    raise exception 'audit_log accepts inserts only via the audit trigger';
  end if;
  return new;
end;
$$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.prevent_audit_log_mutation();

create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.prevent_audit_log_mutation();

create trigger audit_log_guard_insert
  before insert on public.audit_log
  for each row execute function public.guard_audit_log_insert();

-- Attach the audit trigger to every modifiable table (data-model §9).
do $$
declare
  v_table text;
  v_tables text[] := array[
    'profiles', 'sources', 'citations',
    'locations', 'events', 'persons',
    'event_translations', 'person_translations', 'location_translations', 'claim_translations',
    'claims', 'claim_citations',
    'event_persons', 'event_locations',
    'content_notes'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_trigger()',
      v_table
    );
  end loop;
end;
$$;
