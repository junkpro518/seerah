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

select plan(48);

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

select has_table('public', 'locations', 'locations table exists');
select has_column('public', 'locations', 'geo_confidence_code', 'locations.geo_confidence_code exists');
select has_column('public', 'locations', 'review_status_code', 'locations.review_status_code exists');
select has_column('public', 'locations', 'deleted_at', 'locations.deleted_at exists');
select ok(
  test_helpers.fk_exists('locations', 'geo_confidence_code', 'confidence_levels', 'code'),
  'locations.geo_confidence_code references confidence_levels.code'
);
select ok(
  test_helpers.fk_exists('locations', 'review_status_code', 'review_states', 'code'),
  'locations.review_status_code references review_states.code'
);

select has_table('public', 'events', 'events table exists');
select has_column('public', 'events', 'timeline_order', 'events.timeline_order exists');
select has_column('public', 'events', 'approx_year_signed', 'events.approx_year_signed exists');
select has_column('public', 'events', 'deleted_at', 'events.deleted_at exists');
select ok(
  test_helpers.fk_exists('events', 'primary_location_id', 'locations', 'id'),
  'events.primary_location_id references locations.id'
);
select ok(
  test_helpers.fk_exists('events', 'review_status_code', 'review_states', 'code'),
  'events.review_status_code references review_states.code'
);

select has_table('public', 'persons', 'persons table exists');
select has_column('public', 'persons', 'full_name', 'persons.full_name exists');
select has_column('public', 'persons', 'kunya', 'persons.kunya exists');
select has_column('public', 'persons', 'title', 'persons.title exists');
select has_column('public', 'persons', 'deleted_at', 'persons.deleted_at exists');
select ok(
  test_helpers.fk_exists('persons', 'review_status_code', 'review_states', 'code'),
  'persons.review_status_code references review_states.code'
);

select has_table('public', 'event_persons', 'event_persons table exists');
select has_column('public', 'event_persons', 'participation_evidence', 'event_persons.participation_evidence exists');
select has_column('public', 'event_persons', 'citation_id', 'event_persons.citation_id exists');
select ok(test_helpers.fk_exists('event_persons', 'event_id', 'events', 'id'), 'event_persons.event_id references events.id');
select ok(test_helpers.fk_exists('event_persons', 'person_id', 'persons', 'id'), 'event_persons.person_id references persons.id');
select ok(test_helpers.fk_exists('event_persons', 'citation_id', 'citations', 'id'), 'event_persons.citation_id references citations.id');

select has_table('public', 'event_locations', 'event_locations table exists');
select has_column('public', 'event_locations', 'order_index', 'event_locations.order_index exists');
select ok(test_helpers.fk_exists('event_locations', 'location_id', 'locations', 'id'), 'event_locations.location_id references locations.id');

select has_table('public', 'content_notes', 'content_notes table exists');
select has_column('public', 'content_notes', 'event_id', 'content_notes.event_id exists');
select has_column('public', 'content_notes', 'person_id', 'content_notes.person_id exists');
select has_column('public', 'content_notes', 'location_id', 'content_notes.location_id exists');
select has_column('public', 'content_notes', 'source_id', 'content_notes.source_id exists');
select has_column('public', 'content_notes', 'note_type_code', 'content_notes.note_type_code exists');
select has_column('public', 'content_notes', 'body', 'content_notes.body exists');
select has_column('public', 'content_notes', 'is_public', 'content_notes.is_public exists');
select ok(test_helpers.fk_exists('content_notes', 'note_type_code', 'note_types', 'code'), 'content_notes.note_type_code references note_types.code');
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'content_notes'
      and column_name = 'is_public'
      and column_default = 'false'
  ),
  'content_notes.is_public defaults false'
);
select * from finish();
