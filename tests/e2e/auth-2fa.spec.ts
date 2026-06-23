import { test, expect } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { authenticator } from "otplib";

/**
 * E2E (US1) — الإثبات المؤجّل لحارس 2FA على المكدّس المحلي الزائل:
 *   1) (API، الأدقّ) نفس المستخدم ونفس الحمولة الصحيحة، AAL هو المتغيّر الوحيد:
 *      دخول بكلمة المرور (aal1، وله عامل مُحقَّق) → كتابة تُرفض بـ **42501** بالضبط
 *      → challenge+verify → aal2 → نفس الكتابة تنجح.
 *   2) (متصفّح) تسجيل TOTP عبر الواجهة حتى aal2 وعرض الرموز الاحتياطية مرة.
 *
 * بلا مفاتيح المكدّس المحلي → تخطٍّ (يضبطها السيرفر؛ لا يمسّ السحابي).
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ready = Boolean(url && anon && serviceKey);

test.describe("US1 — login + mandatory 2FA", () => {
  test.skip(!ready, "needs local stack env: NEXT_PUBLIC_SUPABASE_URL/ANON_KEY + SERVICE_ROLE_KEY");

  const password = "Test-Passw0rd!";

  async function createConfirmedUser(email: string) {
    const admin = createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error, error?.message).toBeNull();
  }

  // ينتظر حتى يتغيّر رمز TOTP عن السابق (GoTrue يرفض إعادة استخدام نفس الرمز للعامل)
  async function freshCodeAfter(secret: string, prevCode: string | null): Promise<string> {
    for (let i = 0; i < 35; i++) {
      const code = authenticator.generate(secret);
      if (code !== prevCode) return code;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return authenticator.generate(secret);
  }

  // يسجّل عامل TOTP ويتحقّق منه (يبلغ aal2). يعيد السرّ ومعرّف العامل وآخر رمز مُستخدَم.
  async function enrollAndVerify(client: SupabaseClient) {
    const { data: enroll, error: enrollErr } = await client.auth.mfa.enroll({ factorType: "totp" });
    expect(enrollErr, enrollErr?.message).toBeNull();
    const factorId = enroll!.id;
    const secret = enroll!.totp.secret;
    const { data: ch } = await client.auth.mfa.challenge({ factorId });
    const code = authenticator.generate(secret);
    const { error: vErr } = await client.auth.mfa.verify({ factorId, challengeId: ch!.id, code });
    expect(vErr, vErr?.message).toBeNull();
    return { factorId, secret, lastCode: code };
  }

  test("aal1 write is rejected with 42501; the same write succeeds at aal2", async () => {
    test.setTimeout(90_000); // قد ننتظر نافذة TOTP جديدة
    const email = `e2e-aal-${Date.now()}@example.test`;
    await createConfirmedUser(email);

    // الجلسة أ: تسجيل عامل والتحقّق منه — السرّ نفسه يبقى صالحًا للجلسات اللاحقة
    const a = createClient(url!, anon!, { auth: { persistSession: false } });
    await a.auth.signInWithPassword({ email, password });
    const { factorId, secret, lastCode } = await enrollAndVerify(a);
    await a.auth.signOut();

    // الجلسة ب: كلمة مرور فقط → aal1 ولديه عامل مُحقَّق (لم يخطُ هذه الجلسة)
    const b = createClient(url!, anon!, { auth: { persistSession: false } });
    await b.auth.signInWithPassword({ email, password });
    const { data: aalB } = await b.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aalB?.currentLevel).toBe("aal1");

    // حمولة صحيحة تمامًا (قيود م٠ مستوفاة) فلا يكون الفشل إلا من RLS (aal2)
    const payload = { title: `e2e ${Date.now()}`, source_type_code: "hadith" };

    const rejected = await b.from("sources").insert(payload).select();
    expect(rejected.error?.code, "aal1 write must be RLS-rejected").toBe("42501");

    // الخطوة لـ aal2 برمز جديد (تجنّب إعادة استخدام رمز الجلسة أ)
    const { data: ch } = await b.auth.mfa.challenge({ factorId });
    const stepCode = await freshCodeAfter(secret, lastCode);
    const { error: vErr } = await b.auth.mfa.verify({ factorId, challengeId: ch!.id, code: stepCode });
    expect(vErr, vErr?.message).toBeNull();

    const { data: aal2 } = await b.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal2?.currentLevel).toBe("aal2");

    // نفس الكتابة بالضبط — الآن تنجح
    const accepted = await b.from("sources").insert(payload).select();
    expect(accepted.error, accepted.error?.message).toBeNull();
    expect(accepted.data).toHaveLength(1);
  });

  test("browser: login → TOTP enroll → aal2 → recovery codes shown once", async ({ page }) => {
    test.setTimeout(60_000);
    const email = `e2e-ui-${Date.now()}@example.test`;
    await createConfirmedUser(email);

    await page.goto("/login");
    await page.getByPlaceholder("البريد الإلكتروني").fill(email);
    await page.getByPlaceholder("كلمة المرور").fill(password);
    await page.getByRole("button", { name: "دخول" }).click();

    await page.waitForURL("**/mfa");
    const secret = (await page.getByTestId("totp-secret").innerText()).trim();
    expect(secret.length).toBeGreaterThan(0);

    // مستخدم جديد → أول رمز يصلح (لا إعادة استخدام)
    const code = authenticator.generate(secret);
    await page.getByPlaceholder("رمز التطبيق (6 أرقام)").fill(code);
    await page.getByRole("button", { name: "تحقّق" }).click();

    await expect(page.getByText("الرموز الاحتياطية")).toBeVisible({ timeout: 15_000 });
  });
});
