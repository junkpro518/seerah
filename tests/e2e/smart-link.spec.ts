import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { e2eEnv, newAal2StaffClient, currentUserId } from "./helpers";
import { suggestLinks } from "@/lib/editor/smart-link";

/**
 * E2E (US6) — الربط الذكي ضد م٠ الحقيقي (المكدّس المحلي الزائل):
 *   حدّ أمني محوري: الاقتراحات للقراءة فقط لكنها تمرّ عبر طبقة الوصول المحترِمة لـ RLS
 *   (جلسة المستخدم/anon) — لا service_role. فالمستخدم لا يُقترَح عليه شيء خارج نطاق رؤيته.
 *
 *   نُثبت ذلك بالتباين **طاقم مقابل anon** (م٠ لا يميّز بين أدوار الطاقم — كلّهم يرون الكل):
 *     - طاقم ينشئ معلومة بترجمة draft + مصدرًا proposed بمصطلح فريد.
 *     - suggestLinks(جلسة الطاقم) → يراهما (الطاقم يرى الكل).
 *     - suggestLinks(عميل anon بلا جلسة) → لا يراهما (anon يرى المنشور/المعتمد فقط) ⇒ RLS يفرز.
 *
 * بلا مفاتيح المكدّس المحلي → تخطٍّ.
 */
const { ready, url, anon } = e2eEnv();
const describeMaybe = ready ? test.describe : test.describe.skip;

describeMaybe("US6 — smart link suggestions respect RLS scope", () => {
  test("staff session sees draft claim + proposed source; anon sees neither", async () => {
    test.setTimeout(120_000);
    const ts = Date.now();
    const term = `زفقجطفريد${ts}`; // مصطلح فريد مدسوس في العنوانين

    const staff = await newAal2StaffClient(`e2e-sl-staff-${ts}@example.test`);
    const uid = await currentUserId(staff);

    // معلومة بحاوية حدث + ترجمة draft تحمل المصطلح
    const { data: ev } = await staff
      .from("events")
      .insert({ timeline_order: 500000 + Math.floor(ts % 90000) })
      .select("id")
      .single();
    const { data: claim, error: claimErr } = await staff
      .from("claims")
      .insert({ event_id: ev!.id, claim_type_code: "event_origin", doc_grade_code: "unverified", created_by: uid })
      .select("id")
      .single();
    expect(claimErr, claimErr?.message).toBeNull();
    const { error: trErr } = await staff
      .from("claim_translations")
      .insert({ claim_id: claim!.id, lang: "ar", title: `${term} غزوة`, created_by: uid });
    expect(trErr, trErr?.message).toBeNull();

    // مصدر proposed يحمل المصطلح
    const { data: src, error: srcErr } = await staff
      .from("sources")
      .insert({ title: `${term} مصدر`, source_type_code: "hadith", created_by: uid })
      .select("id, status_code")
      .single();
    expect(srcErr, srcErr?.message).toBeNull();
    expect(src!.status_code).toBe("proposed");

    // الطاقم يرى الاثنين عبر جلسته
    const staffSug = await suggestLinks(staff as never, term);
    expect(staffSug.some((s) => s.kind === "claim" && s.claimId === claim!.id)).toBe(true);
    expect(staffSug.some((s) => s.kind === "source" && s.id === src!.id)).toBe(true);

    // anon (بلا جلسة) لا يرى أيًّا منهما — RLS م٠ يفرز قبل وصولهما للاقتراح
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    const anonSug = await suggestLinks(anonClient as never, term);
    expect(anonSug.some((s) => s.kind === "claim" && s.claimId === claim!.id)).toBe(false);
    expect(anonSug.some((s) => s.kind === "source" && s.id === src!.id)).toBe(false);
  });
});
