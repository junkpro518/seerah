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

select plan(31);

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

select * from finish();
