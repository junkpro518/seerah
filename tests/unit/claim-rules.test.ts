import { describe, it, expect } from "vitest";
import {
  selectedContainerType,
  validateSingleContainer,
  canSubmitClaim,
  claimUsageMessage,
  canLinkCitationSource,
  CONTAINER_TYPES,
} from "@/lib/claims/rules";

/**
 * وحدة: قواعد المعلومة في العميل (فحص مبكر للتجربة؛ RLS + قيود م٠ هي الفرض الفعلي).
 * تعكس قيد م٠: حاوية واحدة (num_nonnulls=1) + تقديم يتطلّب استشهادًا حيًّا + درجة تتطلّب
 * مصدر حكم تتطلّب استشهادًا بـ grading_source. requires_grading_source يأتي من DB لا مُرمَّز.
 */
describe("single-container rule (claims_one_container)", () => {
  it("accepts exactly one container and reports its type", () => {
    const r = validateSingleContainer({ event_id: "e1" });
    expect(r.ok).toBe(true);
    expect(selectedContainerType({ person_id: "p1" })).toBe("person");
  });

  it("rejects zero containers", () => {
    expect(validateSingleContainer({})).toEqual({ ok: false, reason: "none" });
  });

  it("rejects more than one container", () => {
    expect(validateSingleContainer({ event_id: "e1", location_id: "l1" })).toEqual({
      ok: false,
      reason: "multiple",
    });
  });

  it("exposes the three container types", () => {
    expect([...CONTAINER_TYPES].sort()).toEqual(["event", "location", "person"]);
  });
});

describe("submit rule (enforce_claim_submission_requirements)", () => {
  it("blocks submit with no live citation", () => {
    expect(
      canSubmitClaim({ hasLiveCitation: false, requiresGradingSource: false, hasGradingSourceCitation: false }),
    ).toEqual({ ok: false, reason: "no_citation" });
  });

  it("allows submit with a citation when the grade needs no ruling source", () => {
    expect(
      canSubmitClaim({ hasLiveCitation: true, requiresGradingSource: false, hasGradingSourceCitation: false }),
    ).toEqual({ ok: true });
  });

  it("blocks submit when the grade requires a ruling source but none is present", () => {
    expect(
      canSubmitClaim({ hasLiveCitation: true, requiresGradingSource: true, hasGradingSourceCitation: false }),
    ).toEqual({ ok: false, reason: "needs_grading_source" });
  });

  it("allows submit when the grade requires a ruling source and one is present", () => {
    expect(
      canSubmitClaim({ hasLiveCitation: true, requiresGradingSource: true, hasGradingSourceCitation: true }),
    ).toEqual({ ok: true });
  });
});

describe("approved-source-only link rule (app-level, no DB backing)", () => {
  it("allows linking only when the source is approved", () => {
    expect(canLinkCitationSource("approved")).toBe(true);
    expect(canLinkCitationSource("proposed")).toBe(false);
    expect(canLinkCitationSource("rejected")).toBe(false);
    expect(canLinkCitationSource(null)).toBe(false);
  });
});

describe("usage messages", () => {
  it("returns a non-empty Arabic message for each blocking reason", () => {
    for (const reason of ["none", "multiple", "no_citation", "needs_grading_source"] as const) {
      expect(claimUsageMessage(reason).length).toBeGreaterThan(0);
    }
  });
});
