import { expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";
import { Client } from "pg";

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

export async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getUser();
  return data.user!.id;
}

/**
 * يضبط دور المستخدم في profiles عبر اتصال postgres مباشر (DATABASE_URL): profiles
 * قابل للتحديث للمدير فقط تحت RLS، و service_role بلا صلاحيات جدول — فالاتصال المباشر
 * (يتجاوز RLS) هو سبيل التهيئة في الاختبار. current_role_name() يقرأ profiles حيًّا فيظهر فورًا.
 */
export async function setUserRoleViaPg(userId: string, role: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL required to set roles in review E2E");
  const pg = new Client({ connectionString: databaseUrl });
  await pg.connect();
  try {
    await pg.query("update public.profiles set role_code = $1 where id = $2", [role, userId]);
  } finally {
    await pg.end();
  }
}

/** عميل aal2 بجلسة، مع ضبط دوره (غير author) عبر pg. */
export async function newAal2RoleClient(
  email: string,
  role: string,
): Promise<{ client: SupabaseClient; userId: string }> {
  const client = await newAal2StaffClient(email);
  const userId = await currentUserId(client);
  if (role !== "author") await setUserRoleViaPg(userId, role);
  return { client, userId };
}
