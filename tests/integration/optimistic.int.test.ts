import { describe, it, expect } from "vitest";
import { Client } from "pg";

/**
 * تكامل (FR-030) — آلية القفل التفاؤلي ضد Postgres حقيقي (المكدّس المحلي).
 *
 * يثبت ما لا يثبته اختبار الوحدة: أن trigger م٠ `set_updated_at` يُطلَق فعلًا على كل
 * تحديث، وأن قيمة `updated_at` (timestamptz) تدور ذهابًا/إيابًا بدقّة كاملة، فالتحديث
 * المشروط `... where id and updated_at = loaded` يُصيب صفًّا أولًا ثم صفرًا (تعارض).
 *
 * يستخدم **اتصال postgres المباشر** (DATABASE_URL من `supabase status`) لا مفتاح
 * service_role — لأن service_role في م٠ بلا صلاحيات جدول (أقل-امتياز مقصود). postgres
 * يتجاوز RLS وله كل الصلاحيات، فيعزل **الآلية** عن بوابة RLS (التي تُثبَت في E2E الطور ٣).
 *
 * هذا يطابق ما يفعله `updateWithOptimisticLock` (وحدةً مُختبَر) لكنه ينفّذ نفس الـ SQL
 * المشروط مباشرةً، وهو ما يجعل المساعد صحيحًا في الإنتاج. الدقّة محفوظة عبر ::text/::timestamptz
 * (كما يفعل PostgREST/supabase-js: يعيد updated_at نصًّا ويعيد إرساله نصًّا).
 *
 * بلا DATABASE_URL → تخطٍّ (يضبطه السيرفر؛ المكدّس المحلي زائل، لا يمسّ السحابي).
 */
const databaseUrl = process.env.DATABASE_URL;
const maybe = databaseUrl ? describe : describe.skip;

maybe("optimistic lock mechanism — real Postgres (local stack)", () => {
  it("conditional update succeeds once, then a stale update affects 0 rows (conflict)", async () => {
    const client = new Client({ connectionString: databaseUrl });
    await client.connect();
    try {
      // صفّ موجود من البذر (8 مصادر) — updated_at كنصّ للحفاظ على الدقّة الكاملة
      const picked = await client.query(
        `select id, updated_at::text as updated_at, notes
           from public.sources
          where deleted_at is null
          limit 1`,
      );
      expect(picked.rowCount).toBe(1);
      const { id, updated_at: loaded, notes: original } = picked.rows[0];

      try {
        // التحديث الأول: WHERE updated_at = loaded → يُصيب صفًّا، trigger م٠ يبدّل updated_at
        const first = await client.query(
          `update public.sources set notes = $1
             where id = $2 and updated_at = $3::timestamptz
           returning updated_at::text as updated_at`,
          ["lock-test-first", id, loaded],
        );
        expect(first.rowCount).toBe(1);
        expect(first.rows[0].updated_at).not.toBe(loaded); // trigger بدّلها فعلًا

        // التحديث الثاني يحمل updated_at القديم → صفر صفوف → تعارض، لا كتابة فوق
        const second = await client.query(
          `update public.sources set notes = $1
             where id = $2 and updated_at = $3::timestamptz
           returning id`,
          ["lock-test-second", id, loaded],
        );
        expect(second.rowCount).toBe(0);

        // القيمة الحالية = الأولى لا الثانية
        const after = await client.query(
          `select notes from public.sources where id = $1`,
          [id],
        );
        expect(after.rows[0].notes).toBe("lock-test-first");
      } finally {
        // إعادة الحالة (المكدّس زائل أصلًا، لكن لنبقى نظيفين)
        await client.query(`update public.sources set notes = $1 where id = $2`, [
          original,
          id,
        ]);
      }
    } finally {
      await client.end();
    }
  });
});
