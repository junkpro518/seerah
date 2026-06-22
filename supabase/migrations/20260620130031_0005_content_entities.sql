-- M0 / T013: structural content entities.

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  location_type text,
  latitude double precision,
  longitude double precision,
  geo_confidence_code text not null default 'unknown' references public.confidence_levels(code),
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index locations_review_status_code_idx on public.locations (review_status_code);

create trigger set_locations_updated_at
  before update on public.locations
  for each row
  execute function public.set_updated_at();

create table public.events (
  id uuid primary key default gen_random_uuid(),
  timeline_order integer not null,
  approx_year_signed integer,
  phase text,
  event_type text,
  date_confidence_code text not null default 'unknown' references public.confidence_levels(code),
  primary_location_id uuid references public.locations(id),
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index events_timeline_order_idx on public.events (timeline_order);
create index events_review_status_code_idx on public.events (review_status_code);
create index events_primary_location_id_idx on public.events (primary_location_id);

create trigger set_events_updated_at
  before update on public.events
  for each row
  execute function public.set_updated_at();

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  full_name text,
  kunya text,
  title text,
  person_type text,
  birth_text text,
  death_text text,
  review_status_code text not null default 'draft' references public.review_states(code),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index persons_review_status_code_idx on public.persons (review_status_code);

create trigger set_persons_updated_at
  before update on public.persons
  for each row
  execute function public.set_updated_at();
