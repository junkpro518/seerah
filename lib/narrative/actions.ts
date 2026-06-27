"use server";

import { requireAal2Staff } from "@/lib/auth/requireAal2Staff";
import { updateWithOptimisticLock } from "@/lib/data/optimistic";

type Err = { error: string };
type Ok<T> = { ok: true; data: T };
type Result<T> = Ok<T> | Err;

const ENTITY_TYPES = ["event", "person", "location"] as const;
export type NarrativeEntityType = (typeof ENTITY_TYPES)[number];

const CONFLICT_ERR = "تغيّر هذا السرد منذ فتحه — أعد التحميل قبل الحفظ.";

/**
 * حفظ سرد الكيان لكل لغة في `*_translations.body` (jsonb، يشمل عُقَد claimRef).
 * **لا نكتب body_plain** — محفّز م٠ (0010) يشتقّه. تعديل = قفل تفاؤلي على updated_at.
 * كل كتابة خلف requireAal2Staff (RLS هو الحارس الفعلي).
 */
export async function saveNarrative(input: {
  entityType: NarrativeEntityType;
  entityId: string;
  lang: string;
  bodyJson: unknown;
  existing?: { id: string; updatedAt: string };
}): Promise<Result<{ id: string; updated_at: string }>> {
  if (!ENTITY_TYPES.includes(input.entityType)) return { error: "نوع كيان غير صالح." };

  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }

  const table = `${input.entityType}_translations`;

  if (input.existing) {
    const res = await updateWithOptimisticLock<{ id: string; updated_at: string }>(
      ctx.supabase,
      table,
      input.existing.id,
      input.existing.updatedAt,
      { body: input.bodyJson },
    ).catch(() => null);
    if (res === null) return { error: "تعذّر حفظ السرد." };
    if (!res.ok) return { error: CONFLICT_ERR };
    return { ok: true, data: res.data };
  }

  const { data, error } = await ctx.supabase
    .from(table)
    .insert({
      [`${input.entityType}_id`]: input.entityId,
      lang: input.lang,
      body: input.bodyJson,
      created_by: ctx.userId,
    })
    .select("id, updated_at")
    .single();
  if (error) return { error: "تعذّر حفظ السرد." };
  return { ok: true, data: data as { id: string; updated_at: string } };
}
