-- M0 / 0016: join-table grants. RED until 0016 grants authenticated on claim_citations.
--
-- 0015 enabled RLS on claim_citations but omitted it from the GRANT lists AND the
-- join-table policy block, leaving it deny-all for authenticated (blocks aal2 staff
-- from linking citations — M1 US2). event_persons/event_locations already had grants
-- in 0015 (these assertions pass before 0016); claim_citations is the gap (fails).

select plan(9);

-- claim_citations (the gap — RED before 0016)
select ok(has_table_privilege('authenticated', 'public.claim_citations', 'SELECT'),
  'authenticated has SELECT on claim_citations');
select ok(has_table_privilege('authenticated', 'public.claim_citations', 'INSERT'),
  'authenticated has INSERT on claim_citations');
select ok(has_table_privilege('authenticated', 'public.claim_citations', 'UPDATE'),
  'authenticated has UPDATE on claim_citations');

-- event_persons (already granted in 0015 — guards against regression)
select ok(has_table_privilege('authenticated', 'public.event_persons', 'SELECT'),
  'authenticated has SELECT on event_persons');
select ok(has_table_privilege('authenticated', 'public.event_persons', 'INSERT'),
  'authenticated has INSERT on event_persons');
select ok(has_table_privilege('authenticated', 'public.event_persons', 'UPDATE'),
  'authenticated has UPDATE on event_persons');

-- event_locations (already granted in 0015 — guards against regression)
select ok(has_table_privilege('authenticated', 'public.event_locations', 'SELECT'),
  'authenticated has SELECT on event_locations');
select ok(has_table_privilege('authenticated', 'public.event_locations', 'INSERT'),
  'authenticated has INSERT on event_locations');
select ok(has_table_privilege('authenticated', 'public.event_locations', 'UPDATE'),
  'authenticated has UPDATE on event_locations');

select * from finish();
