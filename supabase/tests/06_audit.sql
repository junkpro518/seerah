-- M0 / T026: comprehensive append-only audit trail.
-- RED until 0012 adds audit_log + audit_trigger + append-only guards.

create or replace function test_helpers.insert_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  select exists (
    select 1 from public.audit_log
    where table_name = 'events' and row_id = v_id::text and op = 'INSERT'
      and new_data is not null and old_data is null and occurred_at is not null
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.update_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  insert into public.events (timeline_order, event_type)
  values (floor(random() * 100000000)::integer, 'قديم')
  returning id into v_id;

  update public.events set event_type = 'جديد' where id = v_id;

  select exists (
    select 1 from public.audit_log
    where table_name = 'events' and row_id = v_id::text and op = 'UPDATE'
      and old_data ->> 'event_type' = 'قديم'
      and new_data ->> 'event_type' = 'جديد'
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.delete_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  insert into public.persons (full_name)
  values ('شخص للحذف ' || gen_random_uuid())
  returning id into v_id;

  delete from public.persons where id = v_id;

  select exists (
    select 1 from public.audit_log
    where table_name = 'persons' and row_id = v_id::text and op = 'DELETE'
      and old_data is not null and new_data is null
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.soft_delete_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  update public.events set deleted_at = now() where id = v_id;

  select exists (
    select 1 from public.audit_log
    where table_name = 'events' and row_id = v_id::text and op = 'UPDATE'
      and (old_data ->> 'deleted_at') is null
      and (new_data ->> 'deleted_at') is not null
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.profile_role_change_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  -- A real auth.users row gives the auto-created profile a valid FK parent, so the
  -- role change below updates it cleanly (a replica-minted profile has no parent
  -- and would violate profiles_id_fkey on update). The auto-profile starts at
  -- role_code = 'author'.
  insert into auth.users (id, aud, role, email)
  values (v_id, 'authenticated', 'authenticated', concat(v_id::text, '@test.local'));

  update public.profiles set role_code = 'editor' where id = v_id;

  select exists (
    select 1 from public.audit_log
    where table_name = 'profiles' and row_id = v_id::text and op = 'UPDATE'
      and old_data ->> 'role_code' = 'author'
      and new_data ->> 'role_code' = 'editor'
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.source_status_change_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('audit-source-' || gen_random_uuid(), 'مصدر تدقيق', 'hadith', 'proposed')
  returning id into v_id;

  update public.sources set status_code = 'approved' where id = v_id;

  select exists (
    select 1 from public.audit_log
    where table_name = 'sources' and row_id = v_id::text and op = 'UPDATE'
      and old_data ->> 'status_code' = 'proposed'
      and new_data ->> 'status_code' = 'approved'
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.audit_log_update_blocked()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  -- ensure at least one audit row exists to attempt to mutate
  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  begin
    update public.audit_log set actor = actor where table_name = 'events' and row_id = v_id::text;
    return false;
  exception when raise_exception then
    return true;
  end;
end;
$$;

create or replace function test_helpers.audit_log_delete_blocked()
returns boolean
language plpgsql
as $$
declare
  v_id uuid;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_id;

  begin
    delete from public.audit_log where table_name = 'events' and row_id = v_id::text;
    return false;
  exception when raise_exception then
    return true;
  end;
end;
$$;

create or replace function test_helpers.audit_log_direct_insert_blocked()
returns boolean
language plpgsql
as $$
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  begin
    insert into public.audit_log (table_name, op) values ('manual', 'INSERT');
    return false;
  exception when raise_exception then
    return true;
  end;
end;
$$;

-- T026 addendum: reference lookups, lookup_labels, and review_transitions are
-- also audited ("audit everything"). RED until 0013 attaches the trigger to them.

create or replace function test_helpers.reference_lookup_change_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  update public.doc_grades set color = '#abcdef' where code = 'sahih_hadith';

  select exists (
    select 1 from public.audit_log
    where table_name = 'doc_grades' and row_id = 'sahih_hadith' and op = 'UPDATE'
      and new_data ->> 'color' = '#abcdef' and occurred_at is not null
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.lookup_label_change_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  update public.lookup_labels set label = 'حديث صحيح (مدقّق)'
  where domain = 'doc_grades' and code = 'sahih_hadith' and lang = 'ar';

  select exists (
    select 1 from public.audit_log
    where table_name = 'lookup_labels' and row_id = 'doc_grades/sahih_hadith/ar' and op = 'UPDATE'
      and new_data ->> 'label' = 'حديث صحيح (مدقّق)'
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.review_transition_change_is_audited()
returns boolean
language plpgsql
as $$
declare
  v_ok boolean;
begin
  if to_regclass('public.audit_log') is null then
    return false;
  end if;

  update public.review_transitions set role_code = 'admin'
  where layer = 'translation' and from_code = 'draft' and to_code = 'submitted';

  select exists (
    select 1 from public.audit_log
    where table_name = 'review_transitions' and row_id = 'translation/draft/submitted' and op = 'UPDATE'
      and old_data ->> 'role_code' = 'author'
      and new_data ->> 'role_code' = 'admin'
  ) into v_ok;
  return v_ok;
end;
$$;

select plan(20);

select has_table('public', 'audit_log', 'audit_log table exists');
select has_column('public', 'audit_log', 'table_name', 'audit_log.table_name exists');
select has_column('public', 'audit_log', 'op', 'audit_log.op exists');
select has_column('public', 'audit_log', 'old_data', 'audit_log.old_data exists');
select has_column('public', 'audit_log', 'new_data', 'audit_log.new_data exists');
select has_column('public', 'audit_log', 'actor', 'audit_log.actor exists');
select has_column('public', 'audit_log', 'occurred_at', 'audit_log.occurred_at exists');
select isnt(to_regprocedure('public.audit_trigger()'), null::regprocedure, 'audit_trigger function exists');

select ok(test_helpers.insert_is_audited(), 'INSERT is audited (op=INSERT, new_data full)');
select ok(test_helpers.update_is_audited(), 'UPDATE is audited with full old/new values');
select ok(test_helpers.delete_is_audited(), 'DELETE is audited (op=DELETE, old_data full)');
select ok(test_helpers.soft_delete_is_audited(), 'soft delete (deleted_at) is audited');
select ok(test_helpers.profile_role_change_is_audited(), 'profiles.role_code change is audited');
select ok(test_helpers.source_status_change_is_audited(), 'sources.status_code approval is audited');
select ok(test_helpers.audit_log_update_blocked(), 'UPDATE on audit_log is blocked (append-only)');
select ok(test_helpers.audit_log_delete_blocked(), 'DELETE on audit_log is blocked (append-only)');
select ok(test_helpers.audit_log_direct_insert_blocked(), 'direct INSERT into audit_log is blocked');

select ok(test_helpers.reference_lookup_change_is_audited(), 'reference lookup change (doc_grades) is audited');
select ok(test_helpers.lookup_label_change_is_audited(), 'lookup_labels change is audited (composite row_id)');
select ok(test_helpers.review_transition_change_is_audited(), 'review_transitions change is audited (composite row_id)');

select * from finish();
