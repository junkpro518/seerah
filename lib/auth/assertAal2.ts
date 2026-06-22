import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * حارس aal2 (FR-004 / SC-001): كل وصول لمسارات `(admin)` وكل كتابة يتطلّب بلوغ aal2 (2FA).
 *
 * هذا حارس تجربة-مستخدم (يمنع مبكرًا برسالة واضحة)؛ **الحارس الفعلي هو RLS م٠**
 * (is_aal2()) الذي يرفض أي كتابة بـ aal1 بـ 42501. لا تعتمد عليه وحده كأمان.
 */
export class Aal2RequiredError extends Error {
  constructor(message = "يلزم تأكيد الدخول بالتحقّق بخطوتين (2FA) قبل المتابعة.") {
    super(message);
    this.name = "Aal2RequiredError";
  }
}

export async function assertAal2(client: SupabaseClient): Promise<void> {
  const { data, error } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  if (error || data?.currentLevel !== "aal2") {
    throw new Aal2RequiredError();
  }
}
