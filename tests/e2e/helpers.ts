import { expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";

/** بيئة المكدّس المحلي الزائل (يضبطها السيرفر؛ لا يمسّ السحابي). */
export function e2eEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return { url, anon, serviceKey, ready: Boolean(url && anon && serviceKey) };
}

export const E2E_PASSWORD = "Test-Passw0rd!";

export async function createConfirmedUser(email: string): Promise<void> {
  const { url, serviceKey } = e2eEnv();
  const admin = createClient(url!, serviceKey!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await admin.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  });
  expect(error, error?.message).toBeNull();
}

/**
 * يُنشئ مستخدمًا (دور author افتراضيًّا = staff)، يسجّل ويبلغ aal2، ويعيد عميلًا بجلسة aal2.
 * يحقّق الشرط المسبق لكل كتابة (RLS: is_staff()+is_aal2()).
 */
export async function newAal2StaffClient(email: string): Promise<SupabaseClient> {
  const { url, anon } = e2eEnv();
  await createConfirmedUser(email);
  const client = createClient(url!, anon!, { auth: { persistSession: false } });
  await client.auth.signInWithPassword({ email, password: E2E_PASSWORD });

  const { data: enroll, error: enrollErr } = await client.auth.mfa.enroll({ factorType: "totp" });
  expect(enrollErr, enrollErr?.message).toBeNull();
  const factorId = enroll!.id;
  const { data: ch } = await client.auth.mfa.challenge({ factorId });
  const code = authenticator.generate(enroll!.totp.secret);
  const { error: vErr } = await client.auth.mfa.verify({ factorId, challengeId: ch!.id, code });
  expect(vErr, vErr?.message).toBeNull();

  const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
  expect(aal?.currentLevel).toBe("aal2");
  return client;
}
