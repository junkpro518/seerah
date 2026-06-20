-- M0 / T011: sources and citations foundation.

create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text,
  title text not null,
  author text,
  source_type_code text not null references public.source_types(code),
  status_code text not null default 'proposed' references public.source_statuses(code),
  reliability text,
  publisher text,
  edition text,
  url text,
  notes text,
  approval_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index sources_slug_live_uniq
  on public.sources (slug)
  where deleted_at is null and slug is not null;

create trigger set_sources_updated_at
  before update on public.sources
  for each row
  execute function public.set_updated_at();

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete restrict,
  reference_text text,
  volume text,
  page_number text,
  hadith_number text,
  url text,
  quote text,
  grading text,
  grading_source text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint citation_grading_needs_source check (
    grading is null
    or (grading_source is not null and btrim(grading_source) <> '')
  )
);

create index citations_source_id_idx on public.citations (source_id);

create trigger set_citations_updated_at
  before update on public.citations
  for each row
  execute function public.set_updated_at();
