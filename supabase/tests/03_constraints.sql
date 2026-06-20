-- M0 / T010: citation grading must name its grading source.

create or replace function test_helpers.citation_without_grading_source_rejected()
returns boolean
language plpgsql
as $$
declare
  v_source_id uuid;
begin
  if to_regclass('public.sources') is null or to_regclass('public.citations') is null then
    return false;
  end if;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('constraint-source-no-grading-source', 'Constraint Source', 'hadith', 'approved')
  returning id into v_source_id;

  begin
    insert into public.citations (source_id, reference_text, grading)
    values (v_source_id, 'ref', 'صحيح');
    return false;
  exception when check_violation then
    return true;
  end;
end;
$$;

create or replace function test_helpers.citation_with_grading_source_accepted()
returns boolean
language plpgsql
as $$
declare
  v_source_id uuid;
begin
  if to_regclass('public.sources') is null or to_regclass('public.citations') is null then
    return false;
  end if;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('constraint-source-with-grading-source', 'Constraint Source', 'hadith', 'approved')
  returning id into v_source_id;

  insert into public.citations (source_id, reference_text, grading, grading_source)
  values (v_source_id, 'ref', 'صحيح', 'الألباني');

  return true;
end;
$$;

create or replace function test_helpers.citation_blank_grading_source_rejected()
returns boolean
language plpgsql
as $$
declare
  v_source_id uuid;
begin
  if to_regclass('public.sources') is null or to_regclass('public.citations') is null then
    return false;
  end if;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('constraint-source-blank-grading-source', 'Constraint Source', 'hadith', 'approved')
  returning id into v_source_id;

  begin
    insert into public.citations (source_id, reference_text, grading, grading_source)
    values (v_source_id, 'ref', 'صحيح', '   ');
    return false;
  exception when check_violation then
    return true;
  end;
end;
$$;

select plan(3);

select ok(
  test_helpers.citation_without_grading_source_rejected(),
  'citation grading without grading_source is rejected'
);

select ok(
  test_helpers.citation_with_grading_source_accepted(),
  'citation grading with grading_source is accepted'
);

select ok(
  test_helpers.citation_blank_grading_source_rejected(),
  'blank grading_source is rejected'
);

select * from finish();
