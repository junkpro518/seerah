import { describe, it, expect } from "vitest";
import {
  CLAIM_REF_TYPE,
  claimRefNode,
  collectClaimRefs,
  deriveClaimNumbers,
  claimHighlightColor,
} from "@/lib/editor/claim-ref";

/**
 * وحدة: عقدة claimRef + اشتقاق الترقيم [n] + لون الهايلايت (لبنة ٣٣).
 * claimRef تعيش داخل body jsonb (لا تغيير مخطط)؛ [n] يُشتقّ وقت العرض ولا يُخزَّن؛
 * التكرار = رقم ثابت للمعلومة (قرار المالك): أ،ب،أ → [1],[2],[1].
 */

// وثيقة ProseMirror مبسّطة
function doc(...claimIds: (string | null)[]) {
  const content = claimIds.map((id) =>
    id === null
      ? { type: "text", text: "نص" }
      : { type: CLAIM_REF_TYPE, attrs: { claimId: id } },
  );
  return { type: "doc", content: [{ type: "paragraph", content }] };
}

describe("claimRef node shape", () => {
  it("is an inline node carrying claimId in attrs (lives in body jsonb)", () => {
    expect(claimRefNode("c1")).toEqual({ type: "claimRef", attrs: { claimId: "c1" } });
    expect(CLAIM_REF_TYPE).toBe("claimRef");
  });
});

describe("collectClaimRefs (document order, with repeats)", () => {
  it("returns claimIds in order of appearance including repeats", () => {
    expect(collectClaimRefs(doc("A", null, "B", "A"))).toEqual(["A", "B", "A"]);
  });

  it("finds refs nested in deep content", () => {
    const nested = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: CLAIM_REF_TYPE, attrs: { claimId: "X" } }] },
        {
          type: "blockquote",
          content: [{ type: "paragraph", content: [{ type: CLAIM_REF_TYPE, attrs: { claimId: "Y" } }] }],
        },
      ],
    };
    expect(collectClaimRefs(nested)).toEqual(["X", "Y"]);
  });

  it("returns [] for a doc with no refs", () => {
    expect(collectClaimRefs(doc(null, null))).toEqual([]);
  });
});

describe("deriveClaimNumbers (stable number per distinct claim, by first appearance)", () => {
  it("numbers distinct claims; a repeat reuses its number", () => {
    const m = deriveClaimNumbers(doc("A", "B", "A"));
    expect(m.get("A")).toBe(1);
    expect(m.get("B")).toBe(2);
    expect(m.size).toBe(2);
  });

  it("reordering changes the derived numbers (render-time, not stored)", () => {
    const m = deriveClaimNumbers(doc("B", "A"));
    expect(m.get("B")).toBe(1);
    expect(m.get("A")).toBe(2);
  });

  it("empty doc → empty map", () => {
    expect(deriveClaimNumbers(doc(null)).size).toBe(0);
  });
});

describe("claimHighlightColor (from lookup colors)", () => {
  it("prefers the doc-grade color, falls back to claim-type color, else null", () => {
    expect(claimHighlightColor({ gradeColor: "#a00", typeColor: "#0a0" })).toBe("#a00");
    expect(claimHighlightColor({ gradeColor: null, typeColor: "#0a0" })).toBe("#0a0");
    expect(claimHighlightColor({ gradeColor: null, typeColor: null })).toBeNull();
  });
});
