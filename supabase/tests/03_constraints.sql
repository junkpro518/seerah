-- M0 / T010+T016: integrity constraints for citations and claims.

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
  values ('constraint-source-no-grading-source-' || gen_random_uuid(), 'Constraint Source', 'hadith', 'approved')
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
  values ('constraint-source-with-grading-source-' || gen_random_uuid(), 'Constraint Source', 'hadith', 'approved')
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
  values ('constraint-source-blank-grading-source-' || gen_random_uuid(), 'Constraint Source', 'hadith', 'approved')
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

create or replace function test_helpers.claim_without_container_rejected()
returns boolean
language plpgsql
as $$
begin
  if to_regclass('public.claims') is null then
    return false;
  end if;

  begin
    insert into public.claims (claim_type_code)
    values ('event_origin');
    return false;
  exception when check_violation then
    return true;
  end;
end;
$$;

create or replace function test_helpers.claim_with_two_containers_rejected()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_person_id uuid;
begin
  if to_regclass('public.claims') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.persons (full_name)
  values ('شخص اختبار ' || gen_random_uuid())
  returning id into v_person_id;

  begin
    insert into public.claims (event_id, person_id, claim_type_code)
    values (v_event_id, v_person_id, 'event_origin');
    return false;
  exception when check_violation then
    return true;
  end;
end;
$$;

create or replace function test_helpers.submitted_claim_without_citation_rejected()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_claim_id uuid;
begin
  if to_regclass('public.claims') is null or to_regclass('public.claim_citations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.claims (event_id, claim_type_code)
  values (v_event_id, 'event_origin')
  returning id into v_claim_id;

  begin
    update public.claims
    set review_status_code = 'submitted'
    where id = v_claim_id;
    return false;
  exception when raise_exception then
    return true;
  end;
end;
$$;

create or replace function test_helpers.claim_grade_without_grading_source_rejected()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_source_id uuid;
  v_citation_id uuid;
  v_claim_id uuid;
begin
  if to_regclass('public.claims') is null or to_regclass('public.claim_citations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('claim-grade-source-missing-' || gen_random_uuid(), 'Claim Grade Source', 'hadith', 'approved')
  returning id into v_source_id;

  insert into public.citations (source_id, reference_text)
  values (v_source_id, 'ref')
  returning id into v_citation_id;

  insert into public.claims (event_id, claim_type_code, doc_grade_code)
  values (v_event_id, 'event_origin', 'sahih_hadith')
  returning id into v_claim_id;

  insert into public.claim_citations (claim_id, citation_id, relation_code)
  values (v_claim_id, v_citation_id, 'primary');

  begin
    update public.claims
    set review_status_code = 'submitted'
    where id = v_claim_id;
    return false;
  exception when raise_exception then
    return true;
  end;
end;
$$;

create or replace function test_helpers.claim_grade_with_grading_source_accepted()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_source_id uuid;
  v_citation_id uuid;
  v_claim_id uuid;
begin
  if to_regclass('public.claims') is null or to_regclass('public.claim_citations') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('claim-grade-source-present-' || gen_random_uuid(), 'Claim Grade Source', 'hadith', 'approved')
  returning id into v_source_id;

  insert into public.citations (source_id, reference_text, grading, grading_source)
  values (v_source_id, 'ref', 'صحيح', 'الألباني')
  returning id into v_citation_id;

  insert into public.claims (event_id, claim_type_code, doc_grade_code)
  values (v_event_id, 'event_origin', 'sahih_hadith')
  returning id into v_claim_id;

  insert into public.claim_citations (claim_id, citation_id, relation_code)
  values (v_claim_id, v_citation_id, 'primary');

  update public.claims
  set review_status_code = 'submitted'
  where id = v_claim_id;

  return true;
end;
$$;

select plan(8);

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

select ok(test_helpers.claim_without_container_rejected(), 'claim without container is rejected');
select ok(test_helpers.claim_with_two_containers_rejected(), 'claim with two containers is rejected');
select ok(test_helpers.submitted_claim_without_citation_rejected(), 'submitted claim without citation is rejected');
select ok(test_helpers.claim_grade_without_grading_source_rejected(), 'claim grade requiring source needs qualifying citation');
select ok(test_helpers.claim_grade_with_grading_source_accepted(), 'claim grade requiring source accepts qualifying citation');

select * from finish();
