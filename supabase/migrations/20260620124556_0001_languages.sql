-- M0 / T005: language lookup foundation.

create table public.languages (
  code text primary key,
  is_source boolean not null default false,
  direction text not null check (direction in ('rtl', 'ltr')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.languages (code, is_source, direction)
values ('ar', true, 'rtl');
