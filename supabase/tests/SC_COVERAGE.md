# M0 — Success Criteria coverage (T032)

Traceability of each success criterion (spec.md §Success Criteria) to the pgTAP
test(s) that prove it. Suite total: **214** assertions across `00`–`09`
(209 after phase 8, +2 SC-008/009 coverage in T032, +3 seed checks in T033).

| SC | Criterion (summary) | Covered by | Status |
|----|---------------------|------------|--------|
| SC-001 | Publish skipping shariah→editorial review is rejected (even admin) | `05_state_machine.sql` — `draft→published rejected even for admin`, role-gated chain | ✅ |
| SC-002 | Every content change (even one character) yields one matching audit row (old/new) | `06_audit.sql` — insert/update/delete + profiles/sources/lookups/review_transitions audited | ✅ |
| SC-003 | Zero successful UPDATE/DELETE on `audit_log` for any role | `06_audit.sql` — `audit_log_update_blocked`, `audit_log_delete_blocked`, `direct_insert_blocked` | ✅ |
| SC-004 | Every claim has a citation + grade; zero grading claims without `grading_source` | `03_constraints.sql` — submitted-without-citation, grade-without-grading-source, `citation_grading_needs_source` | ✅ |
| SC-005 | Zero claims with container count ≠ 1 | `03_constraints.sql` — `claim_without_container`, `claim_with_two_containers` | ✅ |
| SC-006 | anon never reaches any unpublished row | `07_rls.sql` — `anon_cannot_see_draft`, `anon_sees_approved_source_only`, `content_notes_hidden_from_anon` | ✅ |
| SC-007 | Every text entity has `body_plain` derived & synced after save | `04_translations.sql` — body_plain derived on insert/update across all four `*_translations` | ✅ |
| SC-008 | Unpublished translation does not appear in its language | `07_rls.sql` — `unpublished_translation_hidden_from_anon`, `translation_hidden_when_parent_draft` | ✅ (gap closed in T032) |
| SC-009 | No physical delete — all deletes keep the row with `deleted_at` | `07_rls.sql` — `physical_delete_blocked_for_staff` (no DELETE grant); `06_audit.sql` — `soft_delete_is_audited` | ✅ (gap closed in T032) |
| SC-010 | Every FR has ≥1 pgTAP test, red before / green after | Process: red→green commit pairs across T004–T031 (each impl commit follows its red test commit); FR→schema map in data-model.md §12 | ✅ (process) |
| SC-011 | Zero schema changes outside Git-managed migrations | Process: all DDL lives in `supabase/migrations/`; no direct SQL via MCP/dashboard (constitution constraint) | ✅ (process) |

## Notes
- **SC-008 / SC-009** were enforced by the `0015` RLS policies/grants but not
  asserted in isolation; T032 added explicit tests (green against existing
  `0015`, no new migration) so coverage is provable, not implied.
- **SC-010 / SC-011** are process criteria (TDD discipline + migration-only
  schema), satisfied by the workflow rather than a single runtime assertion.
- **Fallback-to-Arabic display** (SC-008's display half) is M6 UI logic; M0
  guarantees only the data-level invariant (unpublished translation not visible).
