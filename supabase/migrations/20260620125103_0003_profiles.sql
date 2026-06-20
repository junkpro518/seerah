-- M0 / T009: user profiles, current role helper, and shared updated_at trigger.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role_code text not null default 'author' references public.roles(code),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

create or replace function public.current_role_name()
returns text
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select p.role_code
  from public.profiles p
  where p.id = auth.uid()
    and p.deleted_at is null;
$$;

create or replace function public.handle_new_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, display_name, role_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', ''),
    'author'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_create_profile
after insert on auth.users
for each row
execute function public.handle_new_auth_user_profile();
