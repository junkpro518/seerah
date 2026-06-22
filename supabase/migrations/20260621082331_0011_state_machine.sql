-- M0 / T025: layer-aware review state machine (structure + translation).
-- Enforced for everyone (including admin/postgres) via a BEFORE UPDATE trigger;
-- RLS (0014) later restricts who may attempt a transition. See
-- contracts/state-machine.md.

create table public.review_transitions (
  layer     text not null check (layer in ('structure', 'translation')),
  from_code text not null references public.review_states(code),
  to_code   text not null references public.review_states(code),
  role_code text not null references public.roles(code),
  primary key (layer, from_code, to_code)
);

-- Structure layer: shariah -> editorial -> publish.
insert into public.review_transitions (layer, from_code, to_code, role_code) values
  ('structure', 'draft',            'submitted',        'author'),
  ('structure', 'submitted',        'shariah_approved', 'shariah_reviewer'),
  ('structure', 'submitted',        'needs_revision',   'shariah_reviewer'),
  ('structure', 'submitted',        'rejected',         'shariah_reviewer'),
  ('structure', 'shariah_approved', 'approved',         'editor'),
  ('structure', 'shariah_approved', 'needs_revision',   'editor'),
  ('structure', 'shariah_approved', 'rejected',         'editor'),
  ('structure', 'approved',         'published',        'admin'),
  ('structure', 'approved',         'needs_revision',   'admin'),
  ('structure', 'published',        'approved',         'admin'),
  ('structure', 'needs_revision',   'submitted',        'author');

-- Translation layer: editorial -> publish only (no shariah; ruling is language-neutral).
insert into public.review_transitions (layer, from_code, to_code, role_code) values
  ('translation', 'draft',          'submitted',      'author'),
  ('translation', 'submitted',      'approved',       'editor'),
  ('translation', 'submitted',      'needs_revision', 'editor'),
  ('translation', 'submitted',      'rejected',       'editor'),
  ('translation', 'approved',       'published',      'admin'),
  ('translation', 'approved',       'needs_revision', 'admin'),
  ('translation', 'published',      'approved',       'admin'),
  ('translation', 'needs_revision', 'submitted',      'author');

create or replace function public.enforce_review_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_layer         text := tg_argv[0];
  v_required_role text;
  v_actor_role    text;
  v_entity        text;
  v_parent_table  text;
  v_parent_id     uuid;
  v_parent_status text;
begin
  -- Only a real status change is a transition (also guarded by the WHEN clause).
  if old.review_status_code is not distinct from new.review_status_code then
    return new;
  end if;

  select role_code into v_required_role
  from public.review_transitions
  where layer = v_layer
    and from_code = old.review_status_code
    and to_code = new.review_status_code;

  -- Rule 1: any (layer, from, to) not in the table is rejected for everyone.
  if v_required_role is null then
    raise exception 'review transition % -> % not allowed in % layer',
      old.review_status_code, new.review_status_code, v_layer;
  end if;

  -- Rule 2: only the authorised role may perform it (actual role match, no no-op bypass).
  v_actor_role := public.current_role_name();
  if v_actor_role is distinct from v_required_role then
    raise exception 'role % may not perform % -> % (requires %)',
      coalesce(v_actor_role, '<none>'), old.review_status_code, new.review_status_code, v_required_role;
  end if;

  -- Rule 3: a translation may not reach published unless its parent structure is published.
  if v_layer = 'translation' and new.review_status_code = 'published' then
    v_entity := replace(tg_table_name, '_translations', '');  -- event / person / location / claim
    v_parent_table := v_entity || 's';                        -- events / persons / locations / claims
    v_parent_id := (to_jsonb(new) ->> (v_entity || '_id'))::uuid;
    execute format('select review_status_code from public.%I where id = $1', v_parent_table)
      into v_parent_status using v_parent_id;
    if v_parent_status is distinct from 'published' then
      raise exception 'translation cannot be published while parent % is % (must be published)',
        v_entity, coalesce(v_parent_status, '<missing>');
    end if;
  end if;

  return new;
end;
$$;

create trigger enforce_review_transition_events
  before update on public.events
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('structure');

create trigger enforce_review_transition_persons
  before update on public.persons
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('structure');

create trigger enforce_review_transition_locations
  before update on public.locations
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('structure');

create trigger enforce_review_transition_claims
  before update on public.claims
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('structure');

create trigger enforce_review_transition_event_translations
  before update on public.event_translations
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('translation');

create trigger enforce_review_transition_person_translations
  before update on public.person_translations
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('translation');

create trigger enforce_review_transition_location_translations
  before update on public.location_translations
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('translation');

create trigger enforce_review_transition_claim_translations
  before update on public.claim_translations
  for each row
  when (old.review_status_code is distinct from new.review_status_code)
  execute function public.enforce_review_transition('translation');
