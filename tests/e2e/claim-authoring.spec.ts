import { test, expect } from "@playwright/test";
import { e2eEnv, newAal2StaffClient } from "./helpers";

/**
 * E2E (US2) — قواعد المعلومة الموثّقة ضد م٠ الحقيقي (المكدّس المحلي الزائل).
 * كلٌّ من السلبيات معزولة لسبب فشل واحد (نصيحة المراجع):
 *   - حاويتان → 23514 (CHECK claims_one_container)
 *   - تقديم بلا استشهاد (درجة لا تتطلّب مصدر حكم) → P0001 (trigger التقديم)
 *   - درجة تتطلّب مصدر حكم باستشهاد بلا grading_source → P0001
 *   - الربط من مصدر غير معتمد: **DB يسمح به** (لا سند DB) — القاعدة تطبيقية فقط.
 * وإيجابي: حدث + استشهاد بمصدر حكم + درجة sahih_hadith → تقديم ينجح.
 *
 * بلا مفاتيح المكدّس المحلي → تخطٍّ.
 */
const { ready } = e2eEnv();
const describeMaybe = ready ? test.describe : test.describe.skip;

describeMaybe("US2 — documented single claim", () => {
  test("happy path: event + grading-source citation + sahih_hadith → submit succeeds", async () => {
    test.setTimeout(60_000);
    const db = await newAal2StaffClient(`e2e-claim-ok-${Date.now()}@example.test`);

    const { data: appr } = await db
      .from("sources")
      .select("id")
      .eq("status_code", "approved")
      .limit(1)
      .single();
    expect(appr?.id, "seed must include an approved source").toBeTruthy();

    const { data: cit } = await db
      .from("citations")
      .insert({ source_id: appr!.id, reference_text: "ref", grading_source: "صححه فلان" })
      .select("id")
      .single();

    const { data: ev } = await db
      .from("events")
      .insert({ timeline_order: 100000 + Math.floor(Date.now() % 100000) })
      .select("id")
      .single();

    const { data: claim, error: claimErr } = await db
      .from("claims")
      .insert({ event_id: ev!.id, claim_type_code: "event_origin", doc_grade_code: "sahih_hadith" })
      .select("id, updated_at")
      .single();
    expect(claimErr, claimErr?.message).toBeNull();

    await db.from("claim_citations").insert({ claim_id: claim!.id, citation_id: cit!.id });

    const submit = await db
      .from("claims")
      .update({ review_status_code: "submitted" })
      .eq("id", claim!.id)
      .eq("updated_at", claim!.updated_at)
      .select("review_status_code");
    expect(submit.error, submit.error?.message).toBeNull();
    expect(submit.data?.[0]?.review_status_code).toBe("submitted");
  });

  test("two containers is rejected by the DB (23514)", async () => {
    test.setTimeout(60_000);
    const db = await newAal2StaffClient(`e2e-claim-2c-${Date.now()}@example.test`);
    const { data: ev } = await db.from("events").insert({ timeline_order: 200001 }).select("id").single();
    const { data: loc } = await db.from("locations").insert({}).select("id").single();

    const res = await db
      .from("claims")
      .insert({ event_id: ev!.id, location_id: loc!.id, claim_type_code: "event_origin", doc_grade_code: "unverified" })
      .select("id");
    expect(res.error?.code, "single-container CHECK must reject").toBe("23514");
  });

  test("submit with no citation is rejected (P0001) — grade needs no ruling source", async () => {
    test.setTimeout(60_000);
    const db = await newAal2StaffClient(`e2e-claim-nocit-${Date.now()}@example.test`);
    const { data: ev } = await db.from("events").insert({ timeline_order: 200002 }).select("id").single();
    const { data: claim } = await db
      .from("claims")
      .insert({ event_id: ev!.id, claim_type_code: "event_origin", doc_grade_code: "sirah_accepted" })
      .select("id, updated_at")
      .single();

    const res = await db
      .from("claims")
      .update({ review_status_code: "submitted" })
      .eq("id", claim!.id)
      .eq("updated_at", claim!.updated_at)
      .select("id");
    expect(res.error?.code).toBe("P0001");
  });

  test("grade requiring a ruling source with a plain citation is rejected (P0001)", async () => {
    test.setTimeout(60_000);
    const db = await newAal2StaffClient(`e2e-claim-nogs-${Date.now()}@example.test`);
    const { data: appr } = await db.from("sources").select("id").eq("status_code", "approved").limit(1).single();
    const { data: cit } = await db
      .from("citations")
      .insert({ source_id: appr!.id, reference_text: "ref" }) // بلا grading_source
      .select("id")
      .single();
    const { data: ev } = await db.from("events").insert({ timeline_order: 200003 }).select("id").single();
    const { data: claim } = await db
      .from("claims")
      .insert({ event_id: ev!.id, claim_type_code: "event_origin", doc_grade_code: "sahih_hadith" })
      .select("id, updated_at")
      .single();
    await db.from("claim_citations").insert({ claim_id: claim!.id, citation_id: cit!.id });

    const res = await db
      .from("claims")
      .update({ review_status_code: "submitted" })
      .eq("id", claim!.id)
      .eq("updated_at", claim!.updated_at)
      .select("id");
    expect(res.error?.code).toBe("P0001");
  });

  test("DB does NOT block linking a non-approved-source citation (rule is app-level only)", async () => {
    test.setTimeout(60_000);
    const db = await newAal2StaffClient(`e2e-claim-unappr-${Date.now()}@example.test`);
    const { data: proposed } = await db
      .from("sources")
      .select("id")
      .eq("status_code", "proposed")
      .limit(1)
      .single();
    expect(proposed?.id, "seed must include a proposed (non-approved) source").toBeTruthy();
    const { data: cit } = await db
      .from("citations")
      .insert({ source_id: proposed!.id, reference_text: "ref" })
      .select("id")
      .single();
    const { data: ev } = await db.from("events").insert({ timeline_order: 200004 }).select("id").single();
    const { data: claim } = await db
      .from("claims")
      .insert({ event_id: ev!.id, claim_type_code: "event_origin", doc_grade_code: "unverified" })
      .select("id")
      .single();

    // الإدراج المباشر ينجح (لا سند DB) — لذا القاعدة تُفرض في linkCitation تطبيقيًّا
    const res = await db
      .from("claim_citations")
      .insert({ claim_id: claim!.id, citation_id: cit!.id })
      .select("id");
    expect(res.error, "DB has no backing for approved-only — must succeed").toBeNull();
  });

  test("browser: /claims is protected (unauthenticated → /login)", async ({ page }) => {
    await page.goto("/claims");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });
});
