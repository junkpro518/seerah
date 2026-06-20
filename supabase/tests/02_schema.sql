-- M0 / T008: profiles foundation and shared schema functions.

create or replace function test_helpers.fk_exists(
  p_table text,
  p_column text,
  p_foreign_table text,
  p_foreign_column text
)
returns boolean
language sql
as $$
  select exists (
    select 1
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_schema = tc.constraint_schema
     and kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
     and kcu.table_name = tc.table_name
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_schema = tc.constraint_schema
     and ccu.constraint_name = tc.constraint_name
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and tc.table_name = p_table
      and kcu.column_name = p_column
      and ccu.table_schema = 'public'
      and ccu.table_name = p_foreign_table
      and ccu.column_name = p_foreign_column
  );
$$;

select plan(11);

select has_table('public', 'profiles', 'profiles table exists');
select has_column('public', 'profiles', 'id', 'profiles.id exists');
select has_column('public', 'profiles', 'display_name', 'profiles.display_name exists');
select has_column('public', 'profiles', 'role_code', 'profiles.role_code exists');
select has_column('public', 'profiles', 'created_at', 'profiles.created_at exists');
select has_column('public', 'profiles', 'updated_at', 'profiles.updated_at exists');

select ok(
  test_helpers.fk_exists('profiles', 'role_code', 'roles', 'code'),
  'profiles.role_code references roles.code'
);

select isnt(to_regprocedure('public.current_role_name()'), null::regprocedure, 'current_role_name function exists');
select isnt(to_regprocedure('public.set_updated_at()'), null::regprocedure, 'set_updated_at trigger function exists');

select has_table('public', 'sources', 'sources table exists');
select has_table('public', 'citations', 'citations table exists');

select * from finish();
