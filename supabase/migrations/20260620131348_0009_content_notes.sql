-- M0 / T021: internal content notes.

create table public.content_notes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events(id),
  person_id uuid references public.persons(id),
  location_id uuid references public.locations(id),
  source_id uuid references public.sources(id),
  note_type_code text not null references public.note_types(code),
  body text not null,
  is_public boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint content_notes_one_container check (num_nonnulls(event_id, person_id, location_id, source_id) = 1)
);

create index content_notes_event_id_idx on public.content_notes (event_id);
create index content_notes_person_id_idx on public.content_notes (person_id);
create index content_notes_location_id_idx on public.content_notes (location_id);
create index content_notes_source_id_idx on public.content_notes (source_id);
create index content_notes_note_type_code_idx on public.content_notes (note_type_code);

create trigger set_content_notes_updated_at
  before update on public.content_notes
  for each row
  execute function public.set_updated_at();
