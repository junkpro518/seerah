-- M0 / T028: notification outbox (queue + feeding). RED until 0014.

create or replace function test_helpers.publish_creates_outbox()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_user uuid;
  v_ok boolean;
begin
  if to_regclass('public.notification_outbox') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  perform test_helpers.seed_to_state('public.events'::regclass, v_event_id, 'approved');

  v_user := test_helpers.create_role_user('admin');
  perform test_helpers.set_jwt_claims(v_user, 'authenticated', 'aal2');
  update public.events set review_status_code = 'published' where id = v_event_id;
  perform test_helpers.reset_auth_context();

  select exists (
    select 1 from public.notification_outbox
    where event_type = 'content_published'
      and payload ->> 'row_id' = v_event_id::text
      and payload ->> 'new_status' = 'published'
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.submit_creates_outbox()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_user uuid;
  v_ok boolean;
begin
  if to_regclass('public.notification_outbox') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  v_user := test_helpers.create_role_user('author');
  perform test_helpers.set_jwt_claims(v_user, 'authenticated', 'aal2');
  update public.events set review_status_code = 'submitted' where id = v_event_id;
  perform test_helpers.reset_auth_context();

  select exists (
    select 1 from public.notification_outbox
    where event_type = 'content_submitted'
      and payload ->> 'row_id' = v_event_id::text
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.source_approval_creates_outbox()
returns boolean
language plpgsql
as $$
declare
  v_source_id uuid;
  v_ok boolean;
begin
  if to_regclass('public.notification_outbox') is null then
    return false;
  end if;

  insert into public.sources (slug, title, source_type_code, status_code)
  values ('outbox-source-' || gen_random_uuid(), 'مصدر للاعتماد', 'hadith', 'proposed')
  returning id into v_source_id;

  update public.sources set status_code = 'approved' where id = v_source_id;

  select exists (
    select 1 from public.notification_outbox
    where event_type = 'source_approved'
      and payload ->> 'row_id' = v_source_id::text
  ) into v_ok;
  return v_ok;
end;
$$;

create or replace function test_helpers.outbox_is_updatable()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_user uuid;
  v_status text;
begin
  if to_regclass('public.notification_outbox') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  perform test_helpers.seed_to_state('public.events'::regclass, v_event_id, 'approved');
  v_user := test_helpers.create_role_user('admin');
  perform test_helpers.set_jwt_claims(v_user, 'authenticated', 'aal2');
  update public.events set review_status_code = 'published' where id = v_event_id;
  perform test_helpers.reset_auth_context();

  -- outbox is a queue, not append-only: a consumer marks rows delivered.
  update public.notification_outbox
  set status = 'sent', delivered_at = now()
  where event_type = 'content_published' and payload ->> 'row_id' = v_event_id::text;

  select status into v_status
  from public.notification_outbox
  where event_type = 'content_published' and payload ->> 'row_id' = v_event_id::text
  limit 1;

  return v_status = 'sent';
end;
$$;

create or replace function test_helpers.non_worthy_change_makes_no_outbox()
returns boolean
language plpgsql
as $$
declare
  v_event_id uuid;
  v_exists boolean;
begin
  if to_regclass('public.notification_outbox') is null then
    return false;
  end if;

  insert into public.events (timeline_order)
  values (floor(random() * 100000000)::integer)
  returning id into v_event_id;

  -- a non-status update must not enqueue a notification
  update public.events set event_type = 'تعديل غير جدير' where id = v_event_id;

  select exists (
    select 1 from public.notification_outbox where payload ->> 'row_id' = v_event_id::text
  ) into v_exists;
  return not v_exists;
end;
$$;

select plan(11);

select has_table('public', 'notification_outbox', 'notification_outbox table exists');
select has_column('public', 'notification_outbox', 'event_type', 'notification_outbox.event_type exists');
select has_column('public', 'notification_outbox', 'payload', 'notification_outbox.payload exists');
select has_column('public', 'notification_outbox', 'status', 'notification_outbox.status exists (queue state)');
select has_column('public', 'notification_outbox', 'delivered_at', 'notification_outbox.delivered_at exists');
select has_column('public', 'notification_outbox', 'created_at', 'notification_outbox.created_at exists');

select ok(test_helpers.publish_creates_outbox(), 'publish transition enqueues content_published');
select ok(test_helpers.submit_creates_outbox(), 'submit transition enqueues content_submitted');
select ok(test_helpers.source_approval_creates_outbox(), 'source approval enqueues source_approved');
select ok(test_helpers.outbox_is_updatable(), 'outbox row is updatable (queue, not append-only)');
select ok(test_helpers.non_worthy_change_makes_no_outbox(), 'non-status change enqueues nothing');

select * from finish();
