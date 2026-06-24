import { test, expect } from "@playwright/test";
import { e2eEnv, newAal2StaffClient } from "./helpers";
import { CLAIM_REF_TYPE, deriveClaimNumbers, collectClaimRefs } from "@/lib/editor/claim-ref";

/**
 * E2E (US3) — السرد الغني + claimRef ضد م٠ الحقيقي (المكدّس المحلي الزائل):
 *   - حفظ body jsonb يحوي عُقَد claimRef ينجح (لا تغيير مخطط — تعيش في عمود قائم).
 *   - محفّز م٠ (0010) يشتقّ body_plain تلقائيًّا من عُقَد النص فقط (يتجاهل claimRef):
 *     النصّ موجود، ومعرّفات المعلومات غائبة. **لا نكتب body_plain.**
 *   - تعديل body فقط (الحالة لم تتغيّر) لا يُفعّل محفّز انتقال الترجمة، ويُحدِّث body_plain.
 *   - الترقيم [n] مشتقّ من body المحفوظ (أ،ب،أ → [1],[2],[1]).
 *
 * بلا مفاتيح المكدّس المحلي → تخطٍّ.
 */
const { ready } = e2eEnv();
const describeMaybe = ready ? test.describe : test.describe.skip;

function paragraph(...nodes: object[]) {
  return { type: "doc", content: [{ type: "paragraph", content: nodes }] };
}
const txt = (t: string) => ({ type: "text", text: t });
const ref = (claimId: string) => ({ type: CLAIM_REF_TYPE, attrs: { claimId } });

describeMaybe("US3 — rich narrative editor + claimRef", () => {
  test("body jsonb stores claimRef; m0 derives body_plain (text only); numbering derives", async () => {
    test.setTimeout(60_000);
    const db = await newAal2StaffClient(`e2e-narr-${Date.now()}@example.test`);

    const { data: ev } = await db
      .from("events")
      .insert({ timeline_order: 300000 + Math.floor(Date.now() % 100000) })
      .select("id")
      .single();

    const body = paragraph(
      txt("النصّ الأول "),
      ref("claim-aaa"),
      txt(" والنصّ الثاني "),
      ref("claim-bbb"),
      txt(" وإعادة "),
      ref("claim-aaa"),
    );

    const ins = await db
      .from("event_translations")
      .insert({ event_id: ev!.id, lang: "ar", body })
      .select("id, updated_at, body_plain")
      .single();
    expect(ins.error, ins.error?.message).toBeNull();

    // م٠ اشتقّ body_plain: النصّ موجود، ومعرّفات claimRef غائبة
    const plain = ins.data!.body_plain as string;
    expect(plain).toContain("الأول");
    expect(plain).toContain("الثاني");
    expect(plain).not.toContain("claim-aaa");
    expect(plain).not.toContain("claim-bbb");

    // الترقيم المشتقّ من body المخزّن: أ،ب،أ → ثابت للمعلومة
    expect(collectClaimRefs(body)).toEqual(["claim-aaa", "claim-bbb", "claim-aaa"]);
    const nums = deriveClaimNumbers(body);
    expect(nums.get("claim-aaa")).toBe(1);
    expect(nums.get("claim-bbb")).toBe(2);

    // تعديل body فقط (الحالة لم تتغيّر) → ينجح ويُحدّث body_plain
    const reordered = paragraph(txt("ترتيب جديد "), ref("claim-bbb"), txt(" ثم "), ref("claim-aaa"));
    const upd = await db
      .from("event_translations")
      .update({ body: reordered })
      .eq("id", ins.data!.id)
      .eq("updated_at", ins.data!.updated_at)
      .select("body_plain");
    expect(upd.error, upd.error?.message).toBeNull();
    const plain2 = upd.data![0].body_plain as string;
    expect(plain2).toContain("ترتيب جديد");
    expect(plain2).not.toContain("الأول");
  });

  test("browser: /entities is protected (unauthenticated → /login)", async ({ page }) => {
    await page.goto("/entities");
    await page.waitForURL("**/login");
    expect(page.url()).toContain("/login");
  });
});
