import { describe, it, expect } from "vitest";
import { Client } from "pg";
import { REVIEW_TRANSITIONS } from "@/lib/review/transitions";

/**
 * تكامل (US4) — تطابق المرآة مع م٠: يقرأ كل صفوف review_transitions من القاعدة الحقيقية
 * ويؤكّد أنها = الثابت REVIEW_TRANSITIONS (نفس الثابت الذي تستخدمه الواجهة). يحوّل
 * «المرآة نأمل أنها تطابق» إلى «المرآة تطابق فعلًا». اتصال postgres مباشر (DATABASE_URL)
 * لأن review_transitions مقروء للمدير فقط تحت RLS.
 *
 * بلا DATABASE_URL → تخطٍّ.
 */
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? describe : describe.skip;

const key = (t: { layer: string; from: string; to: string; role: string }) =>
  `${t.layer}|${t.from}|${t.to}|${t.role}`;

maybe("review_transitions mirror parity (constant == m0 table)", () => {
  it("the mirrored constant equals every live review_transitions row", async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      const res = await client.query(
        "select layer, from_code, to_code, role_code from public.review_transitions",
      );
      const dbSet = new Set(
        res.rows.map((r) =>
          key({ layer: r.layer, from: r.from_code, to: r.to_code, role: r.role_code }),
        ),
      );
      const mirrorSet = new Set(REVIEW_TRANSITIONS.map(key));

      // مجموعتان متطابقتان تمامًا (لا صف زائد في أيٍّ منهما)
      expect([...mirrorSet].sort()).toEqual([...dbSet].sort());
    } finally {
      await client.end();
    }
  });
});
