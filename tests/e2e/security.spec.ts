import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { e2eEnv, createConfirmedUser, E2E_PASSWORD } from "./helpers";

/**
 * E2E (الطور ٩ / T042) — تثبيت أمني صريح لمعياري النجاح:
 *
 *  SC-008: المفتاح السري (service_role) لا يدخل حزمة المتصفّح إطلاقًا.
 *    إثبات وقت التشغيل (يكمّل الحارس الثابت في tests/unit): نُحمّل صفحة عميل ونجمع
 *    كل ملفات JS المخدومة فعلًا، ونؤكّد أن قيمة المفتاح السري غائبة عنها كلّها.
 *
 *  SC-001: كل كتابة تتطلّب aal2 — جلسة aal1 (كلمة مرور فقط) تُرفض كتابتها بـ 42501 (RLS م٠).
 *
 * بلا مفاتيح المكدّس المحلي الزائل → تخطٍّ (يضبطها السيرفر؛ لا يمسّ السحابي).
 */
const { url, anon, serviceKey, ready } = e2eEnv();
const describeMaybe = ready ? test.describe : test.describe.skip;

describeMaybe("security — SC-008 (no service role in client bundle) + SC-001 (aal2 for writes)", () => {
  test("SC-008: the service_role key value appears in no served client JS", async ({ page }) => {
    test.setTimeout(60_000);
    const scripts: string[] = [];
    page.on("response", (r) => {
      if (r.url().endsWith(".js")) scripts.push(r.url());
    });

    await page.goto("/login", { waitUntil: "networkidle" });
    expect(scripts.length, "client page must serve at least one JS chunk").toBeGreaterThan(0);

    for (const src of scripts) {
      const body = await page.request.get(src).then((r) => r.text());
      expect(body.includes(serviceKey!), `service_role key leaked into ${src}`).toBe(false);
      // ولا اسم المتغيّر السرّي ولا الدور الخام
      expect(body).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    }
  });

  test("SC-001: an aal1 (password-only) session is RLS-rejected (42501) on write", async () => {
    test.setTimeout(60_000);
    const email = `e2e-sec-aal1-${Date.now()}@example.test`;
    await createConfirmedUser(email);

    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email, password: E2E_PASSWORD });
    const { data: aal } = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    expect(aal?.currentLevel).toBe("aal1");

    // حمولة صحيحة بالكامل (قيود م٠ مستوفاة) — فلا يكون الرفض إلا من RLS (aal2)
    const res = await client
      .from("sources")
      .insert({ title: `sec ${Date.now()}`, source_type_code: "hadith" })
      .select();
    expect(res.error?.code, "aal1 write must be RLS-rejected").toBe("42501");
  });
});
