import { describe, it, expect } from "vitest";
import { updateWithOptimisticLock } from "@/lib/data/optimistic";

/**
 * وحدة: منطق القفل التفاؤلي (FR-030).
 *
 * عميل وهمي يحاكي سلسلة Supabase: .from(t).update(patch).eq('id',..).eq('updated_at',..).select()
 * مع محاكاة trigger م٠ (set_updated_at) — يُحدّث updated_at عند أي تحديث ناجح.
 * هذا يثبت تفرّع المنطق فقط؛ السلوك الحقيقي (trigger/RLS/round-trip) في اختبار التكامل.
 */
type Row = { id: string; updated_at: string; [k: string]: unknown };

function makeFakeClient(rows: Row[], opts: { bumpTo?: string; error?: unknown } = {}) {
  let bumpCounter = 0;
  return {
    from(_table: string) {
      let patch: Record<string, unknown> = {};
      const filters: Array<[string, unknown]> = [];
      const builder = {
        update(p: Record<string, unknown>) {
          patch = p;
          return builder;
        },
        eq(col: string, val: unknown) {
          filters.push([col, val]);
          return builder;
        },
        select() {
          if (opts.error) return Promise.resolve({ data: null, error: opts.error });
          const matched = rows.filter((r) => filters.every(([c, v]) => r[c] === v));
          for (const r of matched) {
            Object.assign(r, patch);
            // محاكاة trigger م٠: كل تحديث ناجح يبدّل updated_at
            r.updated_at = opts.bumpTo ?? `t-bumped-${++bumpCounter}`;
          }
          return Promise.resolve({ data: matched.map((r) => ({ ...r })), error: null });
        },
      };
      return builder;
    },
  };
}

describe("updateWithOptimisticLock (FR-030)", () => {
  it("succeeds when updated_at matches (1 row affected)", async () => {
    const rows: Row[] = [{ id: "1", updated_at: "t0", notes: null }];
    const client = makeFakeClient(rows);
    const res = await updateWithOptimisticLock(client as never, "sources", "1", "t0", {
      notes: "A",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect((res.data as Row).notes).toBe("A");
  });

  it("reports conflict (no overwrite) when a concurrent edit changed updated_at", async () => {
    const rows: Row[] = [{ id: "1", updated_at: "t0", notes: null }];
    const client = makeFakeClient(rows);

    // كاتبان قرآ نفس updated_at = t0
    const first = await updateWithOptimisticLock(client as never, "sources", "1", "t0", {
      notes: "first",
    });
    expect(first.ok).toBe(true); // الأول ينجح ويبدّل updated_at

    // الثاني يحمل updated_at قديمًا (t0) → صفر صفوف → تعارض، لا كتابة فوق
    const second = await updateWithOptimisticLock(client as never, "sources", "1", "t0", {
      notes: "second",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("conflict");
    expect(rows[0].notes).toBe("first"); // لم تُكتب "second" فوق الأحدث
  });

  it("throws on a DB/authz error (e.g. 42501) — NOT treated as a conflict", async () => {
    const rows: Row[] = [{ id: "1", updated_at: "t0" }];
    const client = makeFakeClient(rows, { error: { code: "42501", message: "permission denied" } });
    await expect(
      updateWithOptimisticLock(client as never, "sources", "1", "t0", { notes: "x" }),
    ).rejects.toThrow();
  });
});
