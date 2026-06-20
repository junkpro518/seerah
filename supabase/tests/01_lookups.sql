-- M0 / T004: languages lookup table and Arabic source language seed.

create or replace function test_helpers.language_text_attr(p_code text, p_attr text)
returns text
language plpgsql
as $$
declare
  v_value text;
begin
  if to_regclass('public.languages') is null then
    return null;
  end if;

  execute format('select %I::text from public.languages where code = $1', p_attr)
    into v_value
    using p_code;
  return v_value;
end;
$$;

select plan(7);

select has_table('public', 'languages', 'languages table exists');
select has_column('public', 'languages', 'code', 'languages.code exists');
select has_column('public', 'languages', 'is_source', 'languages.is_source exists');
select has_column('public', 'languages', 'direction', 'languages.direction exists');

select is(
  test_helpers.language_text_attr('ar', 'code'),
  'ar',
  'Arabic language row is seeded'
);

select is(
  test_helpers.language_text_attr('ar', 'is_source'),
  'true',
  'Arabic is marked as the source language'
);

select is(
  test_helpers.language_text_attr('ar', 'direction'),
  'rtl',
  'Arabic direction is rtl'
);

select * from finish();
