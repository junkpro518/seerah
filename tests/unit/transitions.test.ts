import { describe, it, expect } from "vitest";
import {
  availableTransitions,
  REVIEW_TRANSITIONS,
  layerForTable,
} from "@/lib/review/transitions";

/**
 * وحدة: availableTransitions تُعيد المسموح فقط حسب (الطبقة، الحالة، الدور).
 * مرآة لجدول review_transitions في م٠؛ اختبار التطابق مع القاعدة في
 * tests/integration/transitions-parity.int.test.ts. م٠ (المحفّز) هو الفارض الفعلي.
 */
function toCodes(layer: "structure" | "translation", from: string, role: string) {
  return availableTransitions({ layer, from, role }).map((t) => t.to).sort();
}

describe("availableTransitions (structure layer)", () => {
  it("author at draft can only submit", () => {
    expect(toCodes("structure", "draft", "author")).toEqual(["submitted"]);
  });

  it("shariah_reviewer at submitted sees approve/needs_revision/reject", () => {
    expect(toCodes("structure", "submitted", "shariah_reviewer")).toEqual(
      ["needs_revision", "rejected", "shariah_approved"].sort(),
    );
  });

  it("author at submitted sees nothing (not their step)", () => {
    expect(toCodes("structure", "submitted", "author")).toEqual([]);
  });

  it("editor advances shariah_approved → approved/needs_revision/rejected", () => {
    expect(toCodes("structure", "shariah_approved", "editor")).toEqual(
      ["approved", "needs_revision", "rejected"].sort(),
    );
  });

  it("admin publishes from approved", () => {
    expect(toCodes("structure", "approved", "admin")).toEqual(
      ["needs_revision", "published"].sort(),
    );
  });
});

describe("availableTransitions (translation layer)", () => {
  it("translation has no shariah step: editor approves submitted directly", () => {
    expect(toCodes("translation", "submitted", "editor")).toEqual(
      ["approved", "needs_revision", "rejected"].sort(),
    );
  });

  it("shariah_reviewer has no translation transitions", () => {
    expect(toCodes("translation", "submitted", "shariah_reviewer")).toEqual([]);
  });
});

describe("layerForTable", () => {
  it("maps *_translations to translation, entities to structure", () => {
    expect(layerForTable("events")).toBe("structure");
    expect(layerForTable("claims")).toBe("structure");
    expect(layerForTable("event_translations")).toBe("translation");
    expect(layerForTable("claim_translations")).toBe("translation");
  });
});

describe("REVIEW_TRANSITIONS shape", () => {
  it("has the 11 structure + 8 translation rows (19 total)", () => {
    expect(REVIEW_TRANSITIONS.filter((t) => t.layer === "structure")).toHaveLength(11);
    expect(REVIEW_TRANSITIONS.filter((t) => t.layer === "translation")).toHaveLength(8);
  });
});
