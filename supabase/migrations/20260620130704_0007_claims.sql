-- M0 / T017: claims, claim citations, and submission integrity.

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  person_id uuid references public.persons(id),
  location_id uuid references public.locations(id),
  claim_type_code text not null references public.claim_types(code),
  doc_grade_code text not null default 'unverified' references public.doc_grades(code),
  date_confidence_code text references public.confidence_levels(code),
  display_order integer not null default 0,
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint claims_one_container check (num_nonnulls(event_id, person_id, location_id) = 1)
);

create index claims_event_id_idx on public.claims (event_id);
create index claims_person_id_idx on public.claims (person_id);
create index claims_location_id_idx on public.claims (location_id);
create index claims_review_status_code_idx on public.claims (review_status_code);

create trigger set_claims_updated_at
  before update on public.claims
  for each row
  execute function public.set_updated_at();

create table public.claim_citations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  citation_id uuid not null references public.citations(id) on delete restrict,
  relation_code text not null default 'primary' references public.citation_relations(code),
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index claim_citations_claim_citation_live_uniq
  on public.claim_citations (claim_id, citation_id)
  where deleted_at is null;

create index claim_citations_claim_id_idx on public.claim_citations (claim_id);
create index claim_citations_citation_id_idx on public.claim_citations (citation_id);

alter table public.claim_translations
  add constraint claim_translations_claim_id_fkey
  foreign key (claim_id) references public.claims(id) on delete cascade;

create or replace function public.enforce_claim_submission_requirements()
returns trigger
language plpgsql
as $$
declare
  v_requires_grading_source boolean;
  v_has_live_citation boolean;
  v_has_grading_source boolean;
begin
  if new.review_status_code not in ('submitted', 'shariah_approved', 'approved', 'published') then
    return new;
  end if;

  select exists (
    select 1
    from public.claim_citations cc
    where cc.claim_id = new.id
      and cc.deleted_at is null
  ) into v_has_live_citation;

  if not v_has_live_citation then
    raise exception 'submitted claim requires at least one live citation';
  end if;

  select coalesce(dg.requires_grading_source, false)
  into v_requires_grading_source
  from public.doc_grades dg
  where dg.code = new.doc_grade_code;

  if v_requires_grading_source then
    select exists (
      select 1
      from public.claim_citations cc
      join public.citations c on c.id = cc.citation_id
      where cc.claim_id = new.id
        and cc.deleted_at is null
        and c.deleted_at is null
        and c.grading_source is not null
        and btrim(c.grading_source) <> ''
    ) into v_has_grading_source;

    if not v_has_grading_source then
      raise exception 'claim grade % requires a citation with grading_source', new.doc_grade_code;
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_claim_submission_requirements
  before insert or update of review_status_code, doc_grade_code on public.claims
  for each row
  execute function public.enforce_claim_submission_requirements();
