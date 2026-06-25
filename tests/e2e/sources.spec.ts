import { test, expect } from "@playwright/test";
import { e2eEnv, newAal2StaffClient, newAal2RoleClient } from "./helpers";
import { canLinkCitationSource } from "@/lib/claims/rules";

/**
 * E2E (US5) — اقتراح/اعتماد المصادر ضد م٠ الحقيقي (المكدّس المحلي الزائل):
 *   - الكاتب يقترح مصدرًا → status='proposed' → غير قابل للاستشهاد (canLinkCitationSource=false).
 *   - المدير يعتمده (status='approved', قفل تفاؤلي) → قابل للاستشهاد + يظهر الاعتماد في audit_log (م٠).
 *   - الاعتماد للمدير فقط = قاعدة **تطبيق** (RLS م٠ يسمح لأي طاقم+aal2 بتحديث المصدر) → يُثبَت أن DB يسمح.
 * يحتاج المكدّس + DATABASE_URL (لدور المدير). بدونها → تخطٍّ.
 */
const { ready } = e2eEnv();
const canRun = ready && Boolean(process.env.DATABASE_URL);
const describeMaybe = canRun ? test.describe : test.describe.skip;

describeMaybe("US5 — propose/approve sources", () => {
  test("propose → not citable → admin approves → citable + audited", async () => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const author = await newAal2StaffClient(`e2e-src-author-${ts}@example.test`);
    const admin = (await newAal2RoleClient(`e2e-src-admin-${ts}@example.test`, "admin")).client;

    // الكاتب يقترح
    const proposed = await author
      .from("sources")
      .insert({ title: `مصدر اختبار ${ts}`, source_type_code: "hadith" })
      .select("id, status_code, updated_at")
      .single();
    expect(proposed.error, proposed.error?.message).toBeNull();
    expect(proposed.data!.status_code).toBe("proposed");
    expect(canLinkCitationSource(proposed.data!.status_code)).toBe(false);

    const id = proposed.data!.id as string;

    // المدير يعتمد (قفل تفاؤلي)
    const approved = await admin
      .from("sources")
      .update({ status_code: "approved" })
      .eq("id", id)
      .eq("updated_at", proposed.data!.updated_at)
      .select("status_code")
      .single();
    expect(approved.error, approved.error?.message).toBeNull();
    expect(approved.data!.status_code).toBe("approved");
    expect(canLinkCitationSource("approved")).toBe(true);

    // الاعتماد ظهر في audit_log (يقرؤه المدير — RLS admin-only)
    const audit = await admin
      .from("audit_log")
      .select("op, new_data, row_id, table_name")
      .eq("table_name", "sources")
      .eq("row_id", id);
    expect(audit.error, audit.error?.message).toBeNull();
    const approvalRow = (audit.data ?? []).find(
      (r) => r.op === "UPDATE" && (r.new_data as { status_code?: string })?.status_code === "approved",
    );
    expect(approvalRow, "approval must be captured in audit_log").toBeTruthy();
  });

  test("approve-admin-only is app-level: DB lets a non-admin staff set approved (no DB backing)", async () => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const author = await newAal2StaffClient(`e2e-src-noadmin-${ts}@example.test`);

    const src = await author
      .from("sources")
      .insert({ title: `مصدر ${ts}`, source_type_code: "hadith" })
      .select("id, updated_at")
      .single();

    // الكاتب (غير مدير) يحدّث الحالة مباشرةً — RLS م٠ يسمح (طاقم+aal2) → القاعدة تطبيقية فقط
    const res = await author
      .from("sources")
      .update({ status_code: "approved" })
      .eq("id", src.data!.id)
      .eq("updated_at", src.data!.updated_at)
      .select("status_code");
    expect(res.error, "DB has no admin-only backing for source approval").toBeNull();
    expect(res.data?.[0]?.status_code).toBe("approved");
  });

  test("browser: /sources is protected (unauthenticated → /login)", async ({ page }) => {
    await page.goto("/sources");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });
});
