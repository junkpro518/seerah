-- M0 / T004/T006: lookup tables, seed codes, and Arabic labels.

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

create or replace function test_helpers.lookup_row_count(p_table text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if to_regclass(format('public.%I', p_table)) is null then
    return 0;
  end if;

  execute format('select count(*)::int from public.%I', p_table) into v_count;
  return v_count;
end;
$$;

create or replace function test_helpers.lookup_label_count()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if to_regclass('public.lookup_labels') is null then
    return 0;
  end if;

  select count(*)::int into v_count
  from public.lookup_labels
  where lang = 'ar';
  return v_count;
end;
$$;

create or replace function test_helpers.doc_grades_requiring_grading_source_count()
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if to_regclass('public.doc_grades') is null then
    return 0;
  end if;

  select count(*)::int into v_count
  from public.doc_grades
  where requires_grading_source is true;
  return v_count;
end;
$$;

select plan(32);

select has_table('public', 'languages', 'languages table exists');
select has_column('public', 'languages', 'code', 'languages.code exists');
select has_column('public', 'languages', 'is_source', 'languages.is_source exists');
select has_column('public', 'languages', 'direction', 'languages.direction exists');

select is(test_helpers.language_text_attr('ar', 'code'), 'ar', 'Arabic language row is seeded');
select is(test_helpers.language_text_attr('ar', 'is_source'), 'true', 'Arabic is marked as the source language');
select is(test_helpers.language_text_attr('ar', 'direction'), 'rtl', 'Arabic direction is rtl');

select has_table('public', 'roles', 'roles lookup exists');
select has_table('public', 'review_states', 'review_states lookup exists');
select has_table('public', 'doc_grades', 'doc_grades lookup exists');
select has_table('public', 'confidence_levels', 'confidence_levels lookup exists');
select has_table('public', 'claim_types', 'claim_types lookup exists');
select has_table('public', 'citation_relations', 'citation_relations lookup exists');
select has_table('public', 'source_types', 'source_types lookup exists');
select has_table('public', 'source_statuses', 'source_statuses lookup exists');
select has_table('public', 'note_types', 'note_types lookup exists');
select has_table('public', 'lookup_labels', 'unified lookup_labels table exists');

select has_column('public', 'lookup_labels', 'domain', 'lookup_labels.domain exists');
select has_column('public', 'lookup_labels', 'code', 'lookup_labels.code exists');
select has_column('public', 'lookup_labels', 'lang', 'lookup_labels.lang exists');
select has_column('public', 'lookup_labels', 'label', 'lookup_labels.label exists');

select is(test_helpers.lookup_row_count('roles'), 4, 'roles seed has all codes');
select is(test_helpers.lookup_row_count('review_states'), 7, 'review_states seed has all codes');
select is(test_helpers.lookup_row_count('doc_grades'), 10, 'doc_grades seed has all codes');
select is(test_helpers.lookup_row_count('confidence_levels'), 5, 'confidence_levels seed has all codes');
select is(test_helpers.lookup_row_count('claim_types'), 13, 'claim_types seed has all codes');
select is(test_helpers.lookup_row_count('citation_relations'), 5, 'citation_relations seed has all codes');
select is(test_helpers.lookup_row_count('source_types'), 8, 'source_types seed has all codes');
select is(test_helpers.lookup_row_count('source_statuses'), 3, 'source_statuses seed has all codes');
select is(test_helpers.lookup_row_count('note_types'), 5, 'note_types seed has all codes');

select is(test_helpers.lookup_label_count(), 60, 'each lookup code has an Arabic label');
select is(test_helpers.doc_grades_requiring_grading_source_count(), 3, 'hadith/athar grades require a grading source');

select * from finish();
