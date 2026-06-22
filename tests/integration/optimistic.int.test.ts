import { describe, it, expect } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { updateWithOptimisticLock } from "@/lib/data/optimistic";

/**
 * تكامل (FR-030) — التعارض الحقيقي ضد المكدّس المحلي:
 * يثبت ما لا يثبته اختبار الوحدة: أن trigger م٠ `set_updated_at` يُطلَق فعلًا على كل
 * تحديث، وأن قيمة `updated_at` (timestamptz) تدور ذهابًا وإيابًا عبر عميل JS بدقّة،
 * فيُرفض التحديث الثاني الحامل لقيمة قديمة.
 *
 * يعمل بـ service_role (يتجاوز RLS) لعزل آلية القفل (trigger + WHERE) عن بوابة RLS.
 * فرض RLS (الكتابة بلا aal2 → 42501) يُغطّى مستقلًّا في E2E الطور ٣.
 *
 * بلا مفاتيح المكدّس المحلي → تخطٍّ (لا فشل).
 */
const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const maybe = serviceKey ? describe : describe.skip;

maybe("updateWithOptimisticLock — real DB conflict (local stack)", () => {
  it("rejects the second concurrent edit (stale updated_at → conflict)", async () => {
    const db = createClient(url, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // صفّ موجود من البذر (8 مصادر)
    const { data: picked, error: pickErr } = await db
      .from("sources")
      .select("id, updated_at, notes")
      .is("deleted_at", null)
      .limit(1)
      .single();
    expect(pickErr).toBeNull();
    expect(picked).toBeTruthy();

    const id = picked!.id as string;
    const loaded = picked!.updated_at as string;
    const original = (picked!.notes as string | null) ?? null;

    try {
      // كاتبان قرآ نفس updated_at = loaded
      const first = await updateWithOptimisticLock(db, "sources", id, loaded, {
        notes: "lock-test-first",
      });
      expect(first.ok).toBe(true);
      // trigger م٠ بدّل updated_at فعلًا
      if (first.ok) {
        expect((first.data as { updated_at: string }).updated_at).not.toBe(loaded);
      }

      // الثاني يحمل updated_at القديم → صفر صفوف → تعارض، لا كتابة فوق
      const second = await updateWithOptimisticLock(db, "sources", id, loaded, {
        notes: "lock-test-second",
      });
      expect(second.ok).toBe(false);
      if (!second.ok) expect(second.reason).toBe("conflict");

      // تأكيد: القيمة الحالية = الأولى لا الثانية
      const { data: after } = await db
        .from("sources")
        .select("notes")
        .eq("id", id)
        .single();
      expect(after!.notes).toBe("lock-test-first");
    } finally {
      // إعادة الحالة (المكدّس زائل أصلًا، لكن لنبقى نظيفين)
      await db.from("sources").update({ notes: original }).eq("id", id);
    }
  });
});
