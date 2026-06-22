-- M0 / T029: notification outbox — a delivery queue fed from the audit trail.
--
-- M0 captures and enqueues only; there is NO actual delivery. A later consumer
-- (Supabase Edge Function / webhook on a schedule) will read pending rows,
-- deliver them (Telegram), and set status='sent' + delivered_at — or status=
-- 'failed' to retry. Admin LOGIN/LOGOUT notifications are deferred to a Supabase
-- Auth Hook. Unlike audit_log, this table is intentionally mutable (a queue).
-- data-model §10; decision 26.

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create index notification_outbox_pending_idx on public.notification_outbox (created_at) where status = 'pending';

-- Derive notification-worthy events from each new audit row. Only real
-- transitions (op = UPDATE) qualify, so creating/seeding rows enqueues nothing.
create or replace function public.notify_from_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_new_status text;
  v_old_status text;
begin
  if new.op is distinct from 'UPDATE' then
    return new;
  end if;

  -- review milestones on structure/translation rows (any audited table with the column)
  if new.new_data ? 'review_status_code' then
    v_new_status := new.new_data ->> 'review_status_code';
    v_old_status := new.old_data ->> 'review_status_code';
    if v_new_status is distinct from v_old_status
       and v_new_status in ('submitted', 'approved', 'published', 'rejected') then
      insert into public.notification_outbox (event_type, payload)
      values (
        'content_' || v_new_status,
        jsonb_build_object(
          'table', new.table_name, 'row_id', new.row_id, 'op', new.op,
          'old_status', v_old_status, 'new_status', v_new_status, 'actor', new.actor
        )
      );
    end if;
  end if;

  -- source approval (proposed -> approved)
  if new.table_name = 'sources'
     and (new.new_data ->> 'status_code') = 'approved'
     and (new.old_data ->> 'status_code') is distinct from 'approved' then
    insert into public.notification_outbox (event_type, payload)
    values (
      'source_approved',
      jsonb_build_object(
        'table', new.table_name, 'row_id', new.row_id, 'op', new.op,
        'old_status', new.old_data ->> 'status_code', 'new_status', new.new_data ->> 'status_code',
        'actor', new.actor
      )
    );
  end if;

  return new;
end;
$$;

create trigger notify_outbox_from_audit
  after insert on public.audit_log
  for each row execute function public.notify_from_audit();
