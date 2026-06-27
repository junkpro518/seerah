"use server";

import { requireAal2Staff, requireAal2Admin } from "@/lib/auth/requireAal2Staff";
import { updateWithOptimisticLock } from "@/lib/data/optimistic";

type Err = { error: string };
type Ok<T> = { ok: true; data: T };
type Result<T> = Ok<T> | Err;

const CONFLICT_ERR = "تغيّر هذا المصدر منذ فتحه — أعد التحميل قبل المتابعة.";

/** T039 — اقتراح مصدر (طاقم+aal2). الحالة الافتراضية proposed (م٠). */
export async function proposeSource(input: {
  title: string;
  sourceTypeCode: string;
  author?: string;
  publisher?: string;
  url?: string;
  notes?: string;
}): Promise<Result<{ id: string; updated_at: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }
  if (!input.title?.trim()) return { error: "عنوان المصدر مطلوب." };

  const { data, error } = await ctx.supabase
    .from("sources")
    .insert({
      title: input.title,
      source_type_code: input.sourceTypeCode,
      author: input.author ?? null,
      publisher: input.publisher ?? null,
      url: input.url ?? null,
      notes: input.notes ?? null,
      created_by: ctx.userId,
    })
    .select("id, updated_at")
    .single();
  if (error) return { error: "تعذّر اقتراح المصدر." };
  return { ok: true, data: data as { id: string; updated_at: string } };
}

/**
 * T039 — اعتماد مصدر (**مدير فقط**، aal2) بقفل تفاؤلي.
 * ملاحظة: لا سند DB لقيد «المدير فقط» (RLS م٠ يسمح لأي طاقم+aal2 بتحديث المصدر) — يُفرض هنا.
 * الاعتماد ينعكس في audit_log + outbox تلقائيًّا (محفّزات م٠) — لا نكتبهما يدويًّا.
 */
export async function approveSource(input: {
  id: string;
  loadedUpdatedAt: string;
  approvalNote?: string;
}): Promise<Result<{ id: string; updated_at: string; status_code: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Admin();
  } catch {
    return { error: "اعتماد المصادر يتطلّب دور مدير ببلوغ aal2." };
  }

  const res = await updateWithOptimisticLock<{
    id: string;
    updated_at: string;
    status_code: string;
  }>(ctx.supabase, "sources", input.id, input.loadedUpdatedAt, {
    status_code: "approved",
    approval_note: input.approvalNote ?? null,
  }).catch(() => null);

  if (res === null) return { error: "تعذّر اعتماد المصدر." };
  if (!res.ok) return { error: CONFLICT_ERR };
  return { ok: true, data: res.data };
}
