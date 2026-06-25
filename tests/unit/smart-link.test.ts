import { describe, it, expect } from "vitest";
import {
  normalizeTerm,
  isSearchable,
  toIlikePattern,
  buildOrFilter,
  rankSuggestions,
  mapClaimRows,
  mapSourceRows,
  suggestLinks,
  type Suggestion,
} from "@/lib/editor/smart-link";

/**
 * وحدة: الربط الذكي (US6, FR-022) — منطق نقيّ للبحث/المطابقة/الترتيب.
 *
 * حدود أمنية مثبتة هنا:
 *  - مدخل المستخدم لا يكسر مرشّح PostgREST `.or()`: تُزال محارف القواعد (,():*) وتُهرَّب
 *    أحرف LIKE البدلية (\ % _) — وإلا صار حقن مرشّح.
 *  - suggestLinks يستعلم عبر **العميل المُمرَّر** (جلسة المستخدم/anon المحترِم لـ RLS) —
 *    لا عميل admin/service_role. نطاق الرؤية (طاقم يرى الكل، anon يرى المنشور/المعتمد) فرضه RLS م٠؛
 *    يُثبت فعليًّا في E2E.
 */

describe("normalizeTerm", () => {
  it("trims and collapses internal whitespace", () => {
    expect(normalizeTerm("  بدر   الكبرى ")).toBe("بدر الكبرى");
    expect(normalizeTerm("\tعلي\n")).toBe("علي");
  });
});

describe("isSearchable (min length guard)", () => {
  it("false for empty / too-short terms (avoids hitting DB on a single char)", () => {
    expect(isSearchable("")).toBe(false);
    expect(isSearchable(" ")).toBe(false);
    expect(isSearchable("ب")).toBe(false);
  });
  it("true for terms of length >= 2", () => {
    expect(isSearchable("بد")).toBe(true);
    expect(isSearchable("بدر")).toBe(true);
  });
});

describe("toIlikePattern (injection-safe)", () => {
  it("strips PostgREST .or() grammar chars and escapes SQL wildcards", () => {
    const p = toIlikePattern("a,b%(c");
    // لا تبقى أيّ محارف قواعد PostgREST تكسر .or()
    expect(p).not.toMatch(/[,()*:]/);
    // محاط بـ %...% للمطابقة الجزئية؛ الداخل خالٍ من أحرف LIKE بدلية غير مهرَّبة
    expect(p.startsWith("%")).toBe(true);
    expect(p.endsWith("%")).toBe(true);
    const interior = p.slice(1, -1);
    expect(interior).not.toMatch(/(^|[^\\])[%_]/); // كل % أو _ مهرَّب بـ \
  });

  it("keeps ordinary Arabic letters intact (wrapped only)", () => {
    expect(toIlikePattern("بدر")).toBe("%بدر%");
  });

  it("escapes a lone underscore and percent so they are literal", () => {
    expect(toIlikePattern("a_b")).toBe("%a\\_b%");
    expect(toIlikePattern("50%")).toBe("%50\\%%");
  });
});

describe("buildOrFilter", () => {
  it("builds a PostgREST or-filter over the given columns with one safe pattern", () => {
    const f = buildOrFilter(["title", "summary"], "%بدر%");
    expect(f).toBe("title.ilike.%بدر%,summary.ilike.%بدر%");
  });
});

describe("rankSuggestions (relevance: exact > prefix > contains, stable)", () => {
  const items: Suggestion[] = [
    { kind: "claim", id: "c1", claimId: "c1", label: "غزوة بدر الكبرى" },
    { kind: "claim", id: "c2", claimId: "c2", label: "بدر" },
    { kind: "source", id: "s1", label: "أحداث بدر", status: "approved" },
  ];
  it("ranks exact match first, then prefix, then contains", () => {
    const ranked = rankSuggestions("بدر", items);
    expect(ranked.map((r) => r.id)).toEqual(["c2", "c1", "s1"]);
  });
  it("returns a stable order for equal relevance", () => {
    const eq: Suggestion[] = [
      { kind: "claim", id: "a", claimId: "a", label: "xبدر" },
      { kind: "claim", id: "b", claimId: "b", label: "yبدر" },
    ];
    expect(rankSuggestions("بدر", eq).map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("row mappers", () => {
  it("mapClaimRows → claim suggestions (label from title, falls back to summary)", () => {
    const rows = [
      { claim_id: "c1", title: "بدر", summary: null },
      { claim_id: "c2", title: null, summary: "ملخّص" },
    ];
    expect(mapClaimRows(rows)).toEqual<Suggestion[]>([
      { kind: "claim", id: "c1", claimId: "c1", label: "بدر" },
      { kind: "claim", id: "c2", claimId: "c2", label: "ملخّص" },
    ]);
  });
  it("mapSourceRows → source suggestions (carry status for citability)", () => {
    const rows = [{ id: "s1", title: "صحيح البخاري", status_code: "approved" }];
    expect(mapSourceRows(rows)).toEqual<Suggestion[]>([
      { kind: "source", id: "s1", label: "صحيح البخاري", status: "approved" },
    ]);
  });
});

describe("suggestLinks (uses the injected RLS-respecting client; no admin)", () => {
  // عميل وهمي يسجّل الجداول/المرشّحات المطلوبة ويعيد بيانات مُعدّة
  function fakeClient(claimRows: unknown[], sourceRows: unknown[]) {
    const calls: { table: string; or?: string; limit?: number }[] = [];
    return {
      calls,
      from(table: string) {
        const rec: { table: string; or?: string; limit?: number } = { table };
        calls.push(rec);
        const rows = table === "claim_translations" ? claimRows : sourceRows;
        const builder = {
          select() {
            return builder;
          },
          is() {
            return builder;
          },
          or(expr: string) {
            rec.or = expr;
            return builder;
          },
          limit(n: number) {
            rec.limit = n;
            return Promise.resolve({ data: rows, error: null });
          },
        };
        return builder;
      },
    };
  }

  it("queries claim_translations + sources via the passed client and returns ranked suggestions", async () => {
    const client = fakeClient(
      [{ claim_id: "c1", title: "بدر", summary: null }],
      [{ id: "s1", title: "بدر الكبرى", status_code: "approved" }],
    );
    const out = await suggestLinks(client as never, "بدر");
    const tables = client.calls.map((c) => c.table).sort();
    expect(tables).toEqual(["claim_translations", "sources"]);
    // المرشّح آمن ومبنيّ من النمط
    for (const c of client.calls) expect(c.or).toContain("ilike.%بدر%");
    // exact "بدر" يسبق "بدر الكبرى"
    expect(out.map((s) => s.id)).toEqual(["c1", "s1"]);
  });

  it("returns [] without querying when the term is too short", async () => {
    const client = fakeClient([], []);
    const out = await suggestLinks(client as never, "ب");
    expect(out).toEqual([]);
    expect(client.calls).toEqual([]);
  });
});
