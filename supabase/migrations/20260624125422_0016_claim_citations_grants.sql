-- M0 / 0016: close the RLS-without-grant/policy gap on claim_citations.
--
-- 0015 enabled RLS on claim_citations (line: v_all) but omitted it from BOTH the
-- GRANT lists AND the join-table policy block (which iterated only
-- event_persons/event_locations). Result: RLS enabled + no grant + no policy =
-- deny-all for `authenticated`, so aal2 staff could not link citations to claims
-- (M1 US2 linkCitation / claim_citations insert). A grant alone is insufficient
-- here: without a policy, RLS still denies every row.
--
-- Comprehensive audit (all RLS-enabled tables vs intended grants/policies):
-- claim_citations was the ONLY gap. event_persons and event_locations already had
-- both grants (0015) and policies; lookups/content/translations/sources/citations/
-- profiles/audit_log/notification_outbox/review_transitions are all consistent.
--
-- Fix mirrors the other join tables: staff read all; staff+aal2 write; NO DELETE
-- (soft delete is an UPDATE). anon read is deferred (claim_citations had no prior
-- anon-read policy and the public read path is not built yet). service_role is NOT
-- expanded. RLS + policies remain the guard.

grant select, insert, update on public.claim_citations to authenticated;

create policy claim_citations_read_staff on public.claim_citations
  for select to authenticated
  using (public.is_staff());

create policy claim_citations_write_insert on public.claim_citations
  for insert to authenticated
  with check (public.is_staff() and public.is_aal2());

create policy claim_citations_write_update on public.claim_citations
  for update to authenticated
  using (public.is_staff() and public.is_aal2())
  with check (public.is_staff() and public.is_aal2());
