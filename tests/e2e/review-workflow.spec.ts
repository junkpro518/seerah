import { test, expect } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { e2eEnv, newAal2StaffClient, newAal2RoleClient } from "./helpers";

/**
 * E2E (US4) — سير المراجعة ضد م٠ الحقيقي (المكدّس المحلي الزائل):
 *   - السلسلة الكاملة بالأدوار: author(draft→submitted) → shariah_reviewer(→shariah_approved)
 *     → editor(→approved) → admin(→published). كل خطوة بقفل تفاؤلي على updated_at.
 *   - الممنوع يُرفض من م٠: الدور الخطأ → P0001.
 * الأدوار تُضبط في profiles عبر pg (DATABASE_URL) — راجع helpers. م٠ (المحفّز) هو الفارض.
 *
 * يحتاج مفاتيح المكدّس + DATABASE_URL (لضبط الأدوار). بدونها → تخطٍّ.
 */
const { ready } = e2eEnv();
const canRun = ready && Boolean(process.env.DATABASE_URL);
const describeMaybe = canRun ? test.describe : test.describe.skip;

async function newEventDraft(client: SupabaseClient): Promise<{ id: string; updated_at: string }> {
  const { data, error } = await client
    .from("events")
    .insert({ timeline_order: 400000 + Math.floor(Date.now() % 100000) })
    .select("id, updated_at")
    .single();
  expect(error, error?.message).toBeNull();
  return data as { id: string; updated_at: string };
}

async function transition(
  client: SupabaseClient,
  id: string,
  loadedUpdatedAt: string,
  toState: string,
) {
  return client
    .from("events")
    .update({ review_status_code: toState })
    .eq("id", id)
    .eq("updated_at", loadedUpdatedAt)
    .select("review_status_code, updated_at")
    .single();
}

describeMaybe("US4 — review workflow (structure chain)", () => {
  test("full chain submitted→shariah_approved→approved→published by the right roles", async () => {
    test.setTimeout(180_000);
    const ts = Date.now();
    const author = await newAal2StaffClient(`e2e-rv-author-${ts}@example.test`);
    const shariah = (await newAal2RoleClient(`e2e-rv-shariah-${ts}@example.test`, "shariah_reviewer")).client;
    const editor = (await newAal2RoleClient(`e2e-rv-editor-${ts}@example.test`, "editor")).client;
    const admin = (await newAal2RoleClient(`e2e-rv-admin-${ts}@example.test`, "admin")).client;

    const ev = await newEventDraft(author);

    let cur = ev.updated_at;
    const step = async (client: SupabaseClient, to: string) => {
      const r = await transition(client, ev.id, cur, to);
      expect(r.error, `${to}: ${r.error?.message}`).toBeNull();
      expect(r.data!.review_status_code).toBe(to);
      cur = r.data!.updated_at as string;
    };

    await step(author, "submitted");
    await step(shariah, "shariah_approved");
    await step(editor, "approved");
    await step(admin, "published");
  });

  test("forbidden transition by the wrong role is rejected by m0 (P0001)", async () => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const author = await newAal2StaffClient(`e2e-rv-f-author-${ts}@example.test`);
    const editor = (await newAal2RoleClient(`e2e-rv-f-editor-${ts}@example.test`, "editor")).client;

    const ev = await newEventDraft(author);
    const submitted = await transition(author, ev.id, ev.updated_at, "submitted");
    expect(submitted.error).toBeNull();

    // editor يحاول submitted→shariah_approved (دور shariah_reviewer) → رفض م٠
    const bad = await transition(editor, ev.id, submitted.data!.updated_at as string, "shariah_approved");
    expect(bad.error?.code).toBe("P0001");
  });

  test("browser: /review is protected (unauthenticated → /login)", async ({ page }) => {
    await page.goto("/review");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });
});
