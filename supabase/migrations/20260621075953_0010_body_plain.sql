-- M0 / T023: derive body_plain from body jsonb on all *_translations tables.

-- Walk the rich-text body tree (TipTap/ProseMirror shape) and concatenate the
-- text of every text node in document order. Non-text nodes (e.g. claim_ref)
-- carry no "text" key and contribute nothing. Whitespace is collapsed for search.
create or replace function public.extract_plain(p_body jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_parts text[] := array[]::text[];
  v_child jsonb;
begin
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    return '';
  end if;

  if jsonb_typeof(p_body -> 'text') = 'string' then
    v_parts := array_append(v_parts, p_body ->> 'text');
  end if;

  if jsonb_typeof(p_body -> 'content') = 'array' then
    for v_child in select value from jsonb_array_elements(p_body -> 'content')
    loop
      v_parts := array_append(v_parts, public.extract_plain(v_child));
    end loop;
  end if;

  return btrim(regexp_replace(array_to_string(v_parts, ' '), '\s+', ' ', 'g'));
end;
$$;

create or replace function public.set_body_plain()
returns trigger
language plpgsql
as $$
begin
  new.body_plain := public.extract_plain(new.body);
  return new;
end;
$$;

create trigger set_event_translations_body_plain
  before insert or update of body on public.event_translations
  for each row
  execute function public.set_body_plain();

create trigger set_person_translations_body_plain
  before insert or update of body on public.person_translations
  for each row
  execute function public.set_body_plain();

create trigger set_location_translations_body_plain
  before insert or update of body on public.location_translations
  for each row
  execute function public.set_body_plain();

create trigger set_claim_translations_body_plain
  before insert or update of body on public.claim_translations
  for each row
  execute function public.set_body_plain();
