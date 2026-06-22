-- M0 / T015: multilingual translation tables.

create table public.event_translations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  lang text not null references public.languages(code),
  title text,
  summary text,
  body jsonb not null default '{}'::jsonb,
  body_plain text,
  slug text,
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index event_translations_entity_lang_live_uniq
  on public.event_translations (event_id, lang)
  where deleted_at is null;

create unique index event_translations_lang_slug_live_uniq
  on public.event_translations (lang, slug)
  where deleted_at is null and slug is not null;

create index event_translations_review_status_code_idx on public.event_translations (review_status_code);

create trigger set_event_translations_updated_at
  before update on public.event_translations
  for each row
  execute function public.set_updated_at();

create table public.person_translations (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  lang text not null references public.languages(code),
  title text,
  summary text,
  body jsonb not null default '{}'::jsonb,
  body_plain text,
  slug text,
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index person_translations_entity_lang_live_uniq
  on public.person_translations (person_id, lang)
  where deleted_at is null;

create unique index person_translations_lang_slug_live_uniq
  on public.person_translations (lang, slug)
  where deleted_at is null and slug is not null;

create index person_translations_review_status_code_idx on public.person_translations (review_status_code);

create trigger set_person_translations_updated_at
  before update on public.person_translations
  for each row
  execute function public.set_updated_at();

create table public.location_translations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  lang text not null references public.languages(code),
  title text,
  summary text,
  body jsonb not null default '{}'::jsonb,
  body_plain text,
  slug text,
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index location_translations_entity_lang_live_uniq
  on public.location_translations (location_id, lang)
  where deleted_at is null;

create unique index location_translations_lang_slug_live_uniq
  on public.location_translations (lang, slug)
  where deleted_at is null and slug is not null;

create index location_translations_review_status_code_idx on public.location_translations (review_status_code);

create trigger set_location_translations_updated_at
  before update on public.location_translations
  for each row
  execute function public.set_updated_at();

create table public.claim_translations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null,
  lang text not null references public.languages(code),
  title text,
  summary text,
  body jsonb not null default '{}'::jsonb,
  body_plain text,
  slug text,
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index claim_translations_entity_lang_live_uniq
  on public.claim_translations (claim_id, lang)
  where deleted_at is null;

create unique index claim_translations_lang_slug_live_uniq
  on public.claim_translations (lang, slug)
  where deleted_at is null and slug is not null;

create index claim_translations_review_status_code_idx on public.claim_translations (review_status_code);

create trigger set_claim_translations_updated_at
  before update on public.claim_translations
  for each row
  execute function public.set_updated_at();
