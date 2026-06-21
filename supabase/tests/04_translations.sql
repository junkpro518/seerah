-- M0 / T014: translation tables and live uniqueness.

create or replace function test_helpers.event_translation_duplicate_lang_rejected()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_order integer := floor(random() * 100000000)::integer;
begin
  if to_regclass('public.event_translations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (v_order)
  returning id into v_event_id;

  insert into public.event_translations (event_id, lang, title, slug)
  values (v_event_id, 'ar', 'عنوان', 'event-duplicate-lang-' || gen_random_uuid());

  begin
    insert into public.event_translations (event_id, lang, title, slug)
    values (v_event_id, 'ar', 'عنوان آخر', 'event-duplicate-lang-other-' || gen_random_uuid());
    return false;
  exception when unique_violation then
    return true;
  end;
end;
$$;

create or replace function test_helpers.event_translation_duplicate_live_slug_rejected()
returns boolean
language plpgsql
as $$
declare
  v_event_id_1 uuid;
  v_event_id_2 uuid;
  v_order integer := floor(random() * 100000000)::integer;
  v_slug text := 'event-duplicate-slug-' || gen_random_uuid();
begin
  if to_regclass('public.event_translations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (v_order)
  returning id into v_event_id_1;

  insert into public.events (timeline_order)
  values (v_order + 1)
  returning id into v_event_id_2;

  insert into public.event_translations (event_id, lang, title, slug)
  values (v_event_id_1, 'ar', 'عنوان', v_slug);

  begin
    insert into public.event_translations (event_id, lang, title, slug)
    values (v_event_id_2, 'ar', 'عنوان آخر', v_slug);
    return false;
  exception when unique_violation then
    return true;
  end;
end;
$$;

create or replace function test_helpers.event_translation_soft_deleted_slug_reusable()
returns boolean
language plpgsql
as $$
declare
  v_event_id_1 uuid;
  v_event_id_2 uuid;
  v_order integer := floor(random() * 100000000)::integer;
  v_slug text := 'event-soft-deleted-slug-' || gen_random_uuid();
begin
  if to_regclass('public.event_translations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (v_order)
  returning id into v_event_id_1;

  insert into public.events (timeline_order)
  values (v_order + 1)
  returning id into v_event_id_2;

  insert into public.event_translations (event_id, lang, title, slug, deleted_at)
  values (v_event_id_1, 'ar', 'محذوف', v_slug, now());

  insert into public.event_translations (event_id, lang, title, slug)
  values (v_event_id_2, 'ar', 'حي', v_slug);

  return true;
exception when unique_violation then
  return false;
end;
$$;

-- T022: body_plain is derived from body jsonb (text nodes only; claim_ref ignored).

create or replace function test_helpers.sample_body()
returns jsonb
language sql
immutable
as $$
  select '{"type":"doc","content":[
    {"type":"paragraph","content":[
      {"type":"text","text":"ثبت في الحديث الصحيح"},
      {"type":"claim_ref","attrs":{"claim_id":"00000000-0000-0000-0000-000000000000"}},
      {"type":"text","text":"أن النبي ﷺ هاجر"}
    ]},
    {"type":"paragraph","content":[
      {"type":"text","text":"إلى المدينة"}
    ]}
  ]}'::jsonb;
$$;

create or replace function test_helpers.expected_plain()
returns text
language sql
immutable
as $$
  select 'ثبت في الحديث الصحيح أن النبي ﷺ هاجر إلى المدينة';
$$;

create or replace function test_helpers.event_translation_body_plain_derived()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_plain text;
begin
  if to_regclass('public.event_translations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.event_translations (event_id, lang, body)
  values (v_event_id, 'ar', test_helpers.sample_body())
  returning body_plain into v_plain;

  return v_plain is not distinct from test_helpers.expected_plain();
end;
$$;

create or replace function test_helpers.event_translation_body_plain_updates()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_tr_id uuid;
  v_plain text;
begin
  if to_regclass('public.event_translations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.event_translations (event_id, lang, body)
  values (v_event_id, 'ar', '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"نص قديم"}]}]}'::jsonb)
  returning id into v_tr_id;

  update public.event_translations
  set body = test_helpers.sample_body()
  where id = v_tr_id
  returning body_plain into v_plain;

  return v_plain is not distinct from test_helpers.expected_plain();
end;
$$;

create or replace function test_helpers.person_translation_body_plain_derived()
returns boolean
language plpgsql
as $$
declare
  v_person_id uuid;
  v_plain text;
begin
  if to_regclass('public.person_translations') is null then
    return false;
  end if;

  insert into public.persons (full_name)
  values ('شخص اختبار ' || gen_random_uuid())
  returning id into v_person_id;

  insert into public.person_translations (person_id, lang, body)
  values (v_person_id, 'ar', test_helpers.sample_body())
  returning body_plain into v_plain;

  return v_plain is not distinct from test_helpers.expected_plain();
end;
$$;

create or replace function test_helpers.location_translation_body_plain_derived()
returns boolean
language plpgsql
as $$
declare
  v_location_id uuid;
  v_plain text;
begin
  if to_regclass('public.location_translations') is null then
    return false;
  end if;

  insert into public.locations default values
  returning id into v_location_id;

  insert into public.location_translations (location_id, lang, body)
  values (v_location_id, 'ar', test_helpers.sample_body())
  returning body_plain into v_plain;

  return v_plain is not distinct from test_helpers.expected_plain();
end;
$$;

create or replace function test_helpers.claim_translation_body_plain_derived()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_claim_id uuid;
  v_plain text;
begin
  if to_regclass('public.claim_translations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.claims (event_id, claim_type_code)
  values (v_event_id, 'event_origin')
  returning id into v_claim_id;

  insert into public.claim_translations (claim_id, lang, body)
  values (v_claim_id, 'ar', test_helpers.sample_body())
  returning body_plain into v_plain;

  return v_plain is not distinct from test_helpers.expected_plain();
end;
$$;

select plan(36);

select has_table('public', 'event_translations', 'event_translations table exists');
select has_column('public', 'event_translations', 'event_id', 'event_translations.event_id exists');
select has_column('public', 'event_translations', 'lang', 'event_translations.lang exists');
select has_column('public', 'event_translations', 'body', 'event_translations.body exists');
select has_column('public', 'event_translations', 'body_plain', 'event_translations.body_plain exists');
select has_column('public', 'event_translations', 'slug', 'event_translations.slug exists');
select has_column('public', 'event_translations', 'review_status_code', 'event_translations.review_status_code exists');

select has_table('public', 'person_translations', 'person_translations table exists');
select has_column('public', 'person_translations', 'person_id', 'person_translations.person_id exists');
select has_column('public', 'person_translations', 'lang', 'person_translations.lang exists');
select has_column('public', 'person_translations', 'body', 'person_translations.body exists');
select has_column('public', 'person_translations', 'body_plain', 'person_translations.body_plain exists');
select has_column('public', 'person_translations', 'slug', 'person_translations.slug exists');
select has_column('public', 'person_translations', 'review_status_code', 'person_translations.review_status_code exists');

select has_table('public', 'location_translations', 'location_translations table exists');
select has_column('public', 'location_translations', 'location_id', 'location_translations.location_id exists');
select has_column('public', 'location_translations', 'lang', 'location_translations.lang exists');
select has_column('public', 'location_translations', 'body', 'location_translations.body exists');
select has_column('public', 'location_translations', 'body_plain', 'location_translations.body_plain exists');
select has_column('public', 'location_translations', 'slug', 'location_translations.slug exists');
select has_column('public', 'location_translations', 'review_status_code', 'location_translations.review_status_code exists');

select has_table('public', 'claim_translations', 'claim_translations table exists');
select has_column('public', 'claim_translations', 'claim_id', 'claim_translations.claim_id exists');
select has_column('public', 'claim_translations', 'lang', 'claim_translations.lang exists');
select has_column('public', 'claim_translations', 'body', 'claim_translations.body exists');
select has_column('public', 'claim_translations', 'body_plain', 'claim_translations.body_plain exists');
select has_column('public', 'claim_translations', 'slug', 'claim_translations.slug exists');
select has_column('public', 'claim_translations', 'review_status_code', 'claim_translations.review_status_code exists');

select ok(test_helpers.event_translation_duplicate_lang_rejected(), 'live duplicate (event_id, lang) is rejected');
select ok(test_helpers.event_translation_duplicate_live_slug_rejected(), 'live duplicate (lang, slug) is rejected');
select ok(test_helpers.event_translation_soft_deleted_slug_reusable(), 'soft-deleted slug can be reused');

select ok(test_helpers.event_translation_body_plain_derived(), 'event_translations.body_plain derived from body (claim_ref ignored)');
select ok(test_helpers.event_translation_body_plain_updates(), 'event_translations.body_plain re-derived on body update');
select ok(test_helpers.person_translation_body_plain_derived(), 'person_translations.body_plain derived from body');
select ok(test_helpers.location_translation_body_plain_derived(), 'location_translations.body_plain derived from body');
select ok(test_helpers.claim_translation_body_plain_derived(), 'claim_translations.body_plain derived from body');

select * from finish();
