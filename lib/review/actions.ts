"use server";

import { requireAal2Staff } from "@/lib/auth/requireAal2Staff";
import { updateWithOptimisticLock } from "@/lib/data/optimistic";

type Err = { error: string };
type Ok<T> = { ok: true; data: T };
type Result<T> = Ok<T> | Err;

const REVIEW_TABLES = new Set([
  "events",
  "persons",
  "locations",
  "claims",
  "event_translations",
  "person_translations",
  "location_translations",
  "claim_translations",
]);

/**
 * T036 — تطبيق انتقال مراجعة. الواجهة لا تفرض الحالات؛ **م٠ (المحفّز) يفرض** الدور/الطبقة
 * وقاعدة الطبقتين. هنا فقط: حارس aal2+طاقم + قفل تفاؤلي + UPDATE للحالة. خطأ DB (رفض م٠)
 * → رسالة احتياطية عامة (لا مطابقة نصّ).
 */
export async function applyTransition(input: {
  table: string;
  id: string;
  toState: string;
  loadedUpdatedAt: string;
}): Promise<Result<{ id: string; updated_at: string; review_status_code: string }>> {
  if (!REVIEW_TABLES.has(input.table)) return { error: "جدول غير صالح." };

  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }

  const res = await updateWithOptimisticLock<{
    id: string;
    updated_at: string;
    review_status_code: string;
  }>(ctx.supabase, input.table, input.id, input.loadedUpdatedAt, {
    review_status_code: input.toState,
  }).catch(() => null);

  if (res === null) {
    return { error: "تعذّر تنفيذ الانتقال — قد لا يسمح به دورك أو حالة السجل الحالية." };
  }
  if (!res.ok) return { error: "تغيّر هذا السجل منذ فتحه — أعد التحميل قبل المتابعة." };
  return { ok: true, data: res.data };
}
