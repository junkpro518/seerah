import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * القفل التفاؤلي عبر عمود `updated_at` القائم في م٠ (FR-030) — بلا تغيير مخطط.
 *
 * النتيجة:
 *  - { ok: true, data }      نجح التحديث (صفّ واحد متأثّر؛ trigger م٠ بدّل updated_at).
 *  - { ok: false, reason: "conflict" }  صفر صفوف ولا خطأ ⇒ تغيّر الصف منذ الفتح ⇒ تعارض.
 *
 * ⚠️ شرط مسبق (مهم): يفترض هذا المساعد أن المتصل **أثبت صلاحية الكتابة مسبقًا**
 * (assertAal2 + is_staff). السبب: تحت RLS م٠، عبارة USING تُصفّي كل الصفوف لمتصل بلا
 * صلاحية فتُرجع صفر صفوف **بلا خطأ** — وهو لا يُميَّز عن التعارض الحقيقي. لذلك:
 *  - وجود `error` (مثل 42501 من WITH CHECK) ⇒ فشل صلاحية ⇒ **يُرمى** (ليس تعارضًا).
 *  - `error === null && صفر صفوف` ⇒ تعارض — صالح فقط لأن الصلاحية تأكّدت قبل النداء.
 */
export type OptimisticResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "conflict" };

export async function updateWithOptimisticLock<T = Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  id: string,
  loadedUpdatedAt: string,
  patch: Record<string, unknown>,
): Promise<OptimisticResult<T>> {
  const { data, error } = await client
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("updated_at", loadedUpdatedAt)
    .select();

  if (error) {
    // خطأ قاعدة/صلاحية (مثل 42501) — ليس تعارضًا تفاؤليًّا. يُمرَّر للمتصل.
    throw error;
  }

  const rows = data ?? [];
  if (rows.length === 0) {
    return { ok: false, reason: "conflict" };
  }
  return { ok: true, data: rows[0] as T };
}
