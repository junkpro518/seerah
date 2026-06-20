-- M0 / T019: event join tables.

create table public.event_persons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  role text,
  participation_evidence text,
  citation_id uuid references public.citations(id),
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index event_persons_live_uniq
  on public.event_persons (event_id, person_id, role)
  where deleted_at is null;

create index event_persons_event_id_idx on public.event_persons (event_id);
create index event_persons_person_id_idx on public.event_persons (person_id);
create index event_persons_citation_id_idx on public.event_persons (citation_id);

create table public.event_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  role text,
  order_index integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index event_locations_live_uniq
  on public.event_locations (event_id, location_id, role)
  where deleted_at is null;

create index event_locations_event_id_idx on public.event_locations (event_id);
create index event_locations_location_id_idx on public.event_locations (location_id);
create index event_locations_order_index_idx on public.event_locations (order_index);
