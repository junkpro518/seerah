-- M0 / T003: pgTAP helper functions for local database tests.
-- These helpers are test-only scaffolding. They intentionally live under supabase/tests,
-- not migrations, and are recreated by the local pgTAP runner.

create schema if not exists test_helpers;

grant usage on schema test_helpers to postgres, anon, authenticated, service_role;

create or replace function test_helpers.set_jwt_claims(
  p_sub uuid default gen_random_uuid(),
  p_role text default 'authenticated',
  p_aal text default 'aal2'
)
returns uuid
language plpgsql
as $$
declare
  v_claims jsonb;
begin
  v_claims := jsonb_build_object(
    'sub', p_sub::text,
    'role', p_role,
    'aal', p_aal
  );

  perform set_config('request.jwt.claims', v_claims::text, true);
  perform set_config('request.jwt.claim.sub', p_sub::text, true);
  perform set_config('request.jwt.claim.role', p_role, true);
  perform set_config('request.jwt.claim.aal', p_aal, true);

  return p_sub;
end;
$$;

create or replace function test_helpers.as_role(
  p_db_role text,
  p_sub uuid default gen_random_uuid(),
  p_aal text default 'aal2'
)
returns uuid
language plpgsql
as $$
begin
  perform test_helpers.set_jwt_claims(p_sub, p_db_role, p_aal);
  execute format('set local role %I', p_db_role);
  return p_sub;
end;
$$;

create or replace function test_helpers.as_anon()
returns uuid
language sql
as $$
  select test_helpers.as_role('anon', gen_random_uuid(), 'aal1');
$$;

create or replace function test_helpers.as_authenticated(
  p_sub uuid default gen_random_uuid(),
  p_aal text default 'aal2'
)
returns uuid
language sql
as $$
  select test_helpers.as_role('authenticated', p_sub, p_aal);
$$;

create or replace function test_helpers.as_service_role(
  p_sub uuid default gen_random_uuid(),
  p_aal text default 'aal2'
)
returns uuid
language sql
as $$
  select test_helpers.as_role('service_role', p_sub, p_aal);
$$;

create or replace function test_helpers.reset_auth_context()
returns void
language plpgsql
as $$
begin
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', '', true);
  perform set_config('request.jwt.claim.aal', '', true);
end;
$$;

create or replace function test_helpers.seed_to_state(
  p_table regclass,
  p_id uuid,
  p_target_state text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  -- Explicit test-only bypass used to set up advanced review states after the
  -- state-machine migration exists. Tests that target transitions should still
  -- exercise the real transition path directly.
  -- SECURITY DEFINER only bypasses RLS, not triggers; session_replication_role =
  -- replica disables the enforce_review_transition trigger (added in 0011) so a
  -- direct jump (e.g. draft -> published) succeeds for seeding (plan.md §test stability).
  -- Restore immediately so the bypass is scoped to this UPDATE only (SET LOCAL is
  -- transaction-scoped and pgTAP runs the whole file in one transaction).
  set local session_replication_role = replica;

  execute format('update %s set review_status_code = $1 where id = $2', p_table)
    using p_target_state, p_id;

  get diagnostics v_rows = row_count;

  set local session_replication_role = origin;

  if v_rows <> 1 then
    raise exception 'seed_to_state expected one row in %, updated %', p_table, v_rows;
  end if;
end;
$$;

create or replace function test_helpers.create_role_user(p_role text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  -- Test-only: mint a profile carrying an app role so current_role_name() resolves it.
  -- session_replication_role = replica disables the auth.users FK (and any RLS/triggers)
  -- for this insert; restored to origin immediately after.
  set local session_replication_role = replica;
  insert into public.profiles (id, role_code) values (v_id, p_role);
  set local session_replication_role = origin;
  return v_id;
end;
$$;

select plan(9);

select has_schema('test_helpers', 'test helper schema exists');
select isnt(to_regprocedure('test_helpers.set_jwt_claims(uuid,text,text)'), null::regprocedure, 'set_jwt_claims helper exists');
select isnt(to_regprocedure('test_helpers.as_role(text,uuid,text)'), null::regprocedure, 'as_role helper exists');
select isnt(to_regprocedure('test_helpers.as_anon()'), null::regprocedure, 'as_anon helper exists');
select isnt(to_regprocedure('test_helpers.as_authenticated(uuid,text)'), null::regprocedure, 'as_authenticated helper exists');
select isnt(to_regprocedure('test_helpers.as_service_role(uuid,text)'), null::regprocedure, 'as_service_role helper exists');
select isnt(to_regprocedure('test_helpers.reset_auth_context()'), null::regprocedure, 'reset_auth_context helper exists');
select isnt(to_regprocedure('test_helpers.seed_to_state(regclass,uuid,text)'), null::regprocedure, 'seed_to_state helper exists');
select isnt(to_regprocedure('test_helpers.create_role_user(text)'), null::regprocedure, 'create_role_user helper exists');

select * from finish();
