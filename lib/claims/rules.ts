/**
 * قواعد المعلومة (نقيّة) — فحص مبكر للتجربة يعكس قيود م٠. الفرض الفعلي في القاعدة:
 *  - حاوية واحدة: CHECK claims_one_container (num_nonnulls=1).
 *  - تقديم: trigger enforce_claim_submission_requirements (≥١ استشهاد حيّ؛ ودرجة
 *    requires_grading_source تتطلّب استشهادًا بـ grading_source غير فارغ).
 * نشتقّ رسائل الاستخدام من هذا الفحص (لا من مطابقة نصّ خطأ DB).
 */
export const CONTAINER_TYPES = ["event", "person", "location"] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export type ContainerSelection = {
  event_id?: string | null;
  person_id?: string | null;
  location_id?: string | null;
};

export function selectedContainerType(sel: ContainerSelection): ContainerType | null {
  const present = CONTAINER_TYPES.filter((t) => {
    const v = sel[`${t}_id` as keyof ContainerSelection];
    return v != null && v !== "";
  });
  return present.length === 1 ? present[0] : null;
}

export type ContainerResult = { ok: true; type: ContainerType } | { ok: false; reason: "none" | "multiple" };

export function validateSingleContainer(sel: ContainerSelection): ContainerResult {
  const present = CONTAINER_TYPES.filter((t) => {
    const v = sel[`${t}_id` as keyof ContainerSelection];
    return v != null && v !== "";
  });
  if (present.length === 0) return { ok: false, reason: "none" };
  if (present.length > 1) return { ok: false, reason: "multiple" };
  return { ok: true, type: present[0] };
}

export type SubmitInputs = {
  hasLiveCitation: boolean;
  requiresGradingSource: boolean;
  hasGradingSourceCitation: boolean;
};

export type SubmitResult = { ok: true } | { ok: false; reason: "no_citation" | "needs_grading_source" };

export function canSubmitClaim(i: SubmitInputs): SubmitResult {
  if (!i.hasLiveCitation) return { ok: false, reason: "no_citation" };
  if (i.requiresGradingSource && !i.hasGradingSourceCitation) {
    return { ok: false, reason: "needs_grading_source" };
  }
  return { ok: true };
}

export type ClaimBlockReason = "none" | "multiple" | "no_citation" | "needs_grading_source";

const MESSAGES: Record<ClaimBlockReason, string> = {
  none: "اختر حاوية واحدة للمعلومة (حدث أو شخص أو مكان).",
  multiple: "المعلومة تتبع حاوية واحدة فقط — أزل الحاويات الزائدة.",
  no_citation: "أضف استشهادًا واحدًا على الأقل قبل التقديم (لا معلومة بلا مصدر).",
  needs_grading_source:
    "هذه الدرجة تتطلّب استشهادًا بمصدر حكم (grading_source) — أضف استشهادًا يحمل مصدر الحكم.",
};

export function claimUsageMessage(reason: ClaimBlockReason): string {
  return MESSAGES[reason];
}
