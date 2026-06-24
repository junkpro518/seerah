"use server";

import { requireAal2Staff } from "@/lib/auth/requireAal2Staff";
import { updateWithOptimisticLock } from "@/lib/data/optimistic";
import {
  validateSingleContainer,
  canSubmitClaim,
  claimUsageMessage,
  canLinkCitationSource,
  type ContainerType,
} from "./rules";

type Err = { error: string };
type Ok<T> = { ok: true; data: T };
type Result<T> = Ok<T> | Err;

const GENERIC_SUBMIT_ERR = "تعذّر التقديم — تحقّق من الاستشهادات والدرجة ثم أعد المحاولة.";
const CONFLICT_ERR = "تغيّر هذا السجل منذ فتحه — أعد التحميل قبل الحفظ.";

/** T025 — إنشاء معلومة بنيوية (حاوية واحدة + نوع + درجة)، حالة draft. */
export async function createClaim(input: {
  containerType: ContainerType;
  containerId: string;
  claimTypeCode: string;
  docGradeCode: string;
}): Promise<Result<{ id: string; updated_at: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }

  const container = { [`${input.containerType}_id`]: input.containerId };
  const check = validateSingleContainer(container);
  if (!check.ok) return { error: claimUsageMessage(check.reason) };

  const { data, error } = await ctx.supabase
    .from("claims")
    .insert({
      ...container,
      claim_type_code: input.claimTypeCode,
      doc_grade_code: input.docGradeCode,
      created_by: ctx.userId,
    })
    .select("id, updated_at")
    .single();

  if (error) return { error: "تعذّر إنشاء المعلومة." };
  return { ok: true, data: data as { id: string; updated_at: string } };
}

/** T025 — نصّ المعلومة لكل لغة (claim_translations). تعديل = قفل تفاؤلي. */
export async function saveClaimText(input: {
  claimId: string;
  lang: string;
  title: string;
  summary: string;
  existing?: { id: string; updatedAt: string };
}): Promise<Result<{ id: string; updated_at: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }

  if (input.existing) {
    const res = await updateWithOptimisticLock<{ id: string; updated_at: string }>(
      ctx.supabase,
      "claim_translations",
      input.existing.id,
      input.existing.updatedAt,
      { title: input.title, summary: input.summary },
    ).catch(() => null);
    if (res === null) return { error: "تعذّر حفظ النصّ." };
    if (!res.ok) return { error: CONFLICT_ERR };
    return { ok: true, data: res.data };
  }

  const { data, error } = await ctx.supabase
    .from("claim_translations")
    .insert({
      claim_id: input.claimId,
      lang: input.lang,
      title: input.title,
      summary: input.summary,
      created_by: ctx.userId,
    })
    .select("id, updated_at")
    .single();
  if (error) return { error: "تعذّر حفظ النصّ." };
  return { ok: true, data: data as { id: string; updated_at: string } };
}

/** updateClaim — تعديل حقول المعلومة البنيوية بقفل تفاؤلي. */
export async function updateClaim(input: {
  id: string;
  loadedUpdatedAt: string;
  patch: Record<string, unknown>;
}): Promise<Result<{ id: string; updated_at: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }
  const res = await updateWithOptimisticLock<{ id: string; updated_at: string }>(
    ctx.supabase,
    "claims",
    input.id,
    input.loadedUpdatedAt,
    input.patch,
  ).catch(() => null);
  if (res === null) return { error: "تعذّر تعديل المعلومة." };
  if (!res.ok) return { error: CONFLICT_ERR };
  return { ok: true, data: res.data };
}

/** T026 — ربط استشهاد من **مصدر معتمد فقط** (قاعدة تطبيق — لا سند DB في م٠). */
export async function linkCitation(input: {
  claimId: string;
  citationId: string;
  relationCode?: string;
}): Promise<Result<{ id: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }

  // المصدر المرتبط بالاستشهاد يجب أن يكون approved (قاعدة تطبيق)
  const { data: cit, error: citErr } = await ctx.supabase
    .from("citations")
    .select("id, source:sources(status_code)")
    .eq("id", input.citationId)
    .single();
  if (citErr || !cit) return { error: "الاستشهاد غير موجود." };
  const status = (cit as { source?: { status_code?: string } }).source?.status_code;
  if (!canLinkCitationSource(status)) {
    return { error: "لا يمكن الربط إلا باستشهاد من مصدر معتمد (approved)." };
  }

  const { data, error } = await ctx.supabase
    .from("claim_citations")
    .insert({
      claim_id: input.claimId,
      citation_id: input.citationId,
      relation_code: input.relationCode ?? "primary",
    })
    .select("id")
    .single();
  if (error) return { error: "تعذّر ربط الاستشهاد." };
  return { ok: true, data: data as { id: string } };
}

/**
 * T027 — تقديم المعلومة (draft→submitted). فحص مبكر برسائل استخدام مشتقّة من العميل
 * (لا مطابقة نصّ خطأ DB)؛ ثم قفل تفاؤلي؛ خطأ DB → رسالة احتياطية عامة.
 */
export async function submitClaim(input: {
  id: string;
  loadedUpdatedAt: string;
}): Promise<Result<{ id: string; updated_at: string }>> {
  let ctx;
  try {
    ctx = await requireAal2Staff();
  } catch {
    return { error: "تتطلّب هذه العملية تسجيل دخول بـ 2FA ودورًا ضمن الفريق." };
  }

  // درجة المعلومة + هل تتطلّب مصدر حكم
  const { data: claim, error: claimErr } = await ctx.supabase
    .from("claims")
    .select("doc_grade_code")
    .eq("id", input.id)
    .single();
  if (claimErr || !claim) return { error: "المعلومة غير موجودة." };

  const { data: grade } = await ctx.supabase
    .from("doc_grades")
    .select("requires_grading_source")
    .eq("code", (claim as { doc_grade_code: string }).doc_grade_code)
    .single();
  const requiresGradingSource = Boolean(
    (grade as { requires_grading_source?: boolean } | null)?.requires_grading_source,
  );

  // الاستشهادات الحيّة + هل يوجد فيها grading_source
  const { data: links } = await ctx.supabase
    .from("claim_citations")
    .select("citation:citations(grading_source)")
    .eq("claim_id", input.id)
    .is("deleted_at", null);

  const rows = (links ?? []) as Array<{ citation?: { grading_source?: string | null } }>;
  const hasLiveCitation = rows.length > 0;
  const hasGradingSourceCitation = rows.some(
    (r) => (r.citation?.grading_source ?? "").trim() !== "",
  );

  const verdict = canSubmitClaim({ hasLiveCitation, requiresGradingSource, hasGradingSourceCitation });
  if (!verdict.ok) return { error: claimUsageMessage(verdict.reason) };

  const res = await updateWithOptimisticLock<{ id: string; updated_at: string }>(
    ctx.supabase,
    "claims",
    input.id,
    input.loadedUpdatedAt,
    { review_status_code: "submitted" },
  ).catch(() => null);

  if (res === null) return { error: GENERIC_SUBMIT_ERR }; // قيود م٠ (آلة الحالات/التقديم) ترفض
  if (!res.ok) return { error: CONFLICT_ERR };
  return { ok: true, data: res.data };
}
