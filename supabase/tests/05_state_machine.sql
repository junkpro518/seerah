-- M0 / T024: layer-aware review state machine (structure + translation).
-- RED until 0011 adds review_transitions + enforce_review_transition triggers.

create or replace function test_helpers.review_transition_count(p_layer text)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if to_regclass('public.review_transitions') is null then
    return -1;
  end if;

  select count(*)::int into v_count
  from public.review_transitions
  where layer = p_layer;
  return v_count;
end;
$$;

-- Returns true if the structure transition succeeded, false if rejected (P0001).
create or replace function test_helpers.try_event_transition(p_from text, p_to text, p_role text)
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_user uuid;
begin
  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  if p_from <> 'draft' then
    perform test_helpers.seed_to_state('public.events'::regclass, v_event_id, p_from);
  end if;

  v_user := test_helpers.create_role_user(p_role);
  perform test_helpers.set_jwt_claims(v_user, 'authenticated', 'aal2');

  begin
    update public.events set review_status_code = p_to where id = v_event_id;
    perform test_helpers.reset_auth_context();
    return true;
  exception when raise_exception then
    perform test_helpers.reset_auth_context();
    return false;
  end;
end;
$$;

-- Returns true if the translation transition succeeded, false if rejected (P0001).
create or replace function test_helpers.try_event_translation_transition(
  p_from text,
  p_to text,
  p_role text,
  p_parent_published boolean
)
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_tr_id uuid;
  v_user uuid;
begin
  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  if p_parent_published then
    perform test_helpers.seed_to_state('public.events'::regclass, v_event_id, 'published');
  end if;

  insert into public.event_translations (event_id, lang, body)
  values (v_event_id, 'ar', '{}'::jsonb)
  returning id into v_tr_id;

  if p_from <> 'draft' then
    perform test_helpers.seed_to_state('public.event_translations'::regclass, v_tr_id, p_from);
  end if;

  v_user := test_helpers.create_role_user(p_role);
  perform test_helpers.set_jwt_claims(v_user, 'authenticated', 'aal2');

  begin
    update public.event_translations set review_status_code = p_to where id = v_tr_id;
    perform test_helpers.reset_auth_context();
    return true;
  exception when raise_exception then
    perform test_helpers.reset_auth_context();
    return false;
  end;
end;
$$;

select plan(27);

-- Structure of the machine itself.
select has_table('public', 'review_transitions', 'review_transitions table exists');
select isnt(to_regprocedure('public.enforce_review_transition()'), null::regprocedure, 'enforce_review_transition function exists');
select is(test_helpers.review_transition_count('structure'), 11, 'structure layer has all seeded transitions');
select is(test_helpers.review_transition_count('translation'), 8, 'translation layer has all seeded transitions');

select has_trigger('public', 'events', 'enforce_review_transition_events', 'events has transition trigger');
select has_trigger('public', 'persons', 'enforce_review_transition_persons', 'persons has transition trigger');
select has_trigger('public', 'locations', 'enforce_review_transition_locations', 'locations has transition trigger');
select has_trigger('public', 'claims', 'enforce_review_transition_claims', 'claims has transition trigger');
select has_trigger('public', 'event_translations', 'enforce_review_transition_event_translations', 'event_translations has transition trigger');
select has_trigger('public', 'person_translations', 'enforce_review_transition_person_translations', 'person_translations has transition trigger');
select has_trigger('public', 'location_translations', 'enforce_review_transition_location_translations', 'location_translations has transition trigger');
select has_trigger('public', 'claim_translations', 'enforce_review_transition_claim_translations', 'claim_translations has transition trigger');

-- Structure layer behaviour (chain: shariah -> editorial -> publish).
select ok(not test_helpers.try_event_transition('draft', 'published', 'admin'), 'structure draft->published is rejected even for admin (no jumping)');
select ok(test_helpers.try_event_transition('draft', 'submitted', 'author'), 'structure draft->submitted allowed for author');
select ok(not test_helpers.try_event_transition('draft', 'submitted', 'shariah_reviewer'), 'structure draft->submitted rejected for shariah_reviewer');
select ok(test_helpers.try_event_transition('submitted', 'shariah_approved', 'shariah_reviewer'), 'structure submitted->shariah_approved allowed for shariah_reviewer');
select ok(not test_helpers.try_event_transition('submitted', 'shariah_approved', 'editor'), 'structure submitted->shariah_approved rejected for editor');
select ok(test_helpers.try_event_transition('shariah_approved', 'approved', 'editor'), 'structure shariah_approved->approved allowed for editor');
select ok(not test_helpers.try_event_transition('shariah_approved', 'approved', 'shariah_reviewer'), 'structure shariah_approved->approved rejected for shariah_reviewer');
select ok(test_helpers.try_event_transition('approved', 'published', 'admin'), 'structure approved->published allowed for admin');
select ok(not test_helpers.try_event_transition('approved', 'published', 'editor'), 'structure approved->published rejected for editor');

-- Translation layer behaviour (editorial -> publish only; no shariah; gated on parent).
select ok(not test_helpers.try_event_translation_transition('submitted', 'shariah_approved', 'shariah_reviewer', false), 'translation has no shariah_approved transition');
select ok(test_helpers.try_event_translation_transition('submitted', 'approved', 'editor', false), 'translation submitted->approved allowed for editor');
select ok(not test_helpers.try_event_translation_transition('submitted', 'approved', 'author', false), 'translation submitted->approved rejected for author');
select ok(not test_helpers.try_event_translation_transition('approved', 'published', 'admin', false), 'translation cannot publish while parent structure is not published');
select ok(test_helpers.try_event_translation_transition('approved', 'published', 'admin', true), 'translation approved->published allowed for admin when parent is published');
select ok(test_helpers.try_event_translation_transition('submitted', 'needs_revision', 'editor', false), 'translation submitted->needs_revision allowed for editor (sacred-text exception path)');

select * from finish();
