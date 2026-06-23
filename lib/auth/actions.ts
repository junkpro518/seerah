"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAal2Staff, requireAal2Admin } from "./requireAal2Staff";
import {
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyRecoveryCode,
} from "./recovery";

type ActionError = { error: string };

/**
 * T017 — دخول بكلمة المرور (aal1). النجاح → /mfa (تسجيل أو تحدٍّ لبلوغ aal2).
 */
export async function signIn(formData: FormData): Promise<ActionError | void> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "تعذّر الدخول — تحقّق من البريد وكلمة المرور." };

  redirect("/mfa");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * T019 — الرموز الاحتياطية: تُولَّد بعد بلوغ aal2 (أول تسجيل أو إعادة تسجيل)،
 * تُعرض مرة، وتُخزَّن مجزّأة في app_metadata. **إعادة توليد واستبدال** للقائمة كلها
 * عند كل تسجيل ناجح (يحلّ بياتة الرموز بعد الاستعادة). userId من الجلسة فقط.
 */
export async function setupRecoveryCodes(): Promise<{ codes: string[] } | ActionError> {
  let userId: string;
  try {
    ({ userId } = await requireAal2Staff());
  } catch {
    return { error: "يلزم بلوغ aal2 (2FA) قبل توليد الرموز الاحتياطية." };
  }

  const codes = generateRecoveryCodes(10);
  const hashes = codes.map(hashRecoveryCode);

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { mfa_recovery: hashes },
  });
  if (error) return { error: "تعذّر حفظ الرموز الاحتياطية." };

  return { codes };
}

/**
 * T020 — الاستعادة: يعمل على aal1 (فقد العضو جهازه). userId من الجلسة فقط (لا من العميل)
 * فلا يُهاجَم رمز عضو آخر. يطابق hash (timingSafeEqual) → يحذف عامل TOTP → يستهلك الرمز.
 *
 * ⚠️ ثغرة معروفة (مُبلَّغة للمالك): لا خنق محاولات بعد — رمز صحيح يزيل 2FA = أوراكل تخمين.
 *   الرموز عالية الإنتروبيا تخفّف، لكن يلزم قفل محاولات لاحقًا.
 */
export async function recoverWithCode(code: string): Promise<{ ok: true } | ActionError> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "لا توجد جلسة. سجّل الدخول أولًا." };

  const admin = createAdminClient();
  const { data: target, error: getErr } = await admin.auth.admin.getUserById(user.id);
  if (getErr || !target?.user) return { error: "تعذّرت الاستعادة." };

  const hashes = (target.user.app_metadata?.mfa_recovery as string[] | undefined) ?? [];
  const idx = verifyRecoveryCode(code, hashes);
  if (idx === -1) return { error: "رمز غير صالح." };

  // حذف عوامل TOTP المسجّلة للعضو
  const { data: factors } = await admin.auth.admin.mfa.listFactors({ userId: user.id });
  for (const f of factors?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: user.id });
  }

  // استهلاك الرمز (أحادي الاستخدام)
  const remaining = hashes.filter((_, i) => i !== idx);
  await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { mfa_recovery: remaining },
  });

  return { ok: true };
}

/**
 * T021 — إعادة تعيين 2FA بيد المدير. صلاحية المتصل تُشتقّ من **جلسة المستخدم** (RLS)،
 * والعميل الإداري (service role) يُستخدم فقط لعوامل الهدف (لا يحدّد من المتصل).
 */
export async function adminResetMfa(targetUserId: string): Promise<{ ok: true } | ActionError> {
  try {
    await requireAal2Admin();
  } catch {
    return { error: "هذه العملية تتطلّب مديرًا ببلوغ aal2." };
  }

  const admin = createAdminClient();
  const { data: factors, error: listErr } = await admin.auth.admin.mfa.listFactors({
    userId: targetUserId,
  });
  if (listErr) return { error: "تعذّر قراءة عوامل العضو." };

  for (const f of factors?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: targetUserId });
  }

  // مسح الرموز الاحتياطية القديمة فيُعيد العضو التسجيل من جديد
  await admin.auth.admin.updateUserById(targetUserId, {
    app_metadata: { mfa_recovery: [] },
  });

  return { ok: true };
}
