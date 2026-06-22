-- M0 / T027 addendum: extend the audit trail to reference/config tables.
-- Owner decision ("audit everything"): the ten code-keyed lookups, the unified
-- lookup_labels, and review_transitions are also audited. Their seed rows were
-- inserted in earlier migrations (0001/0002/0011) BEFORE any audit trigger
-- existed, so initial seeding produces no audit noise — only later changes are
-- captured.
--
-- These tables have no `id` column (PK is `code`, or composite), so audit_trigger
-- is replaced to derive row_id by key shape: id (data tables) ->
-- domain/code/lang (lookup_labels) -> layer/from/to (review_transitions) ->
-- code (lookups).

create or replace function public.audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_data jsonb;
  v_row_id text;
begin
  if tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_new := null;
    v_data := v_old;
  elsif tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
    v_data := v_new;
  else
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_data := v_new;
  end if;

  v_row_id := case
    when v_data ? 'id'     then v_data ->> 'id'
    when v_data ? 'domain' then concat_ws('/', v_data ->> 'domain', v_data ->> 'code', v_data ->> 'lang')
    when v_data ? 'layer'  then concat_ws('/', v_data ->> 'layer', v_data ->> 'from_code', v_data ->> 'to_code')
    when v_data ? 'code'   then v_data ->> 'code'
    else null
  end;

  perform set_config('app.audit_ctx', '1', true);
  insert into public.audit_log (table_name, row_id, op, old_data, new_data, actor, actor_role)
  values (tg_table_name, v_row_id, tg_op, v_old, v_new, auth.uid(), public.current_role_name());
  perform set_config('app.audit_ctx', '', true);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Attach the audit trigger to the reference/config tables. Append-only on
-- audit_log (the prevent/guard triggers from 0012) applies to these audit rows
-- identically, regardless of source table.
do $$
declare
  v_table text;
  v_tables text[] := array[
    'languages', 'roles', 'review_states', 'doc_grades', 'confidence_levels',
    'claim_types', 'citation_relations', 'source_types', 'source_statuses', 'note_types',
    'lookup_labels', 'review_transitions'
  ];
begin
  foreach v_table in array v_tables loop
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_trigger()',
      v_table
    );
  end loop;
end;
$$;
