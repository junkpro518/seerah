# سِيرة — موسوعة السيرة النبوية الموثّقة (Seerah)

موسوعة معرفية **موثّقة** للسيرة النبوية وكل من قابل النبي ﷺ: غير ربحية، إدخال يدوي
بالكامل، **كل معلومة لها مرجع**، وتمرّ ببوابة مراجعة إلزامية (كاتب → مراجع شرعي →
محرّر → مدير). مصدر القرارات: `docs/CONCEPT.md` و`docs/GAPS.md`.

هذا المستودع يحوي **م٠ — نواة قاعدة البيانات**: مخطط Postgres متعدد اللغات،
بوابة مراجعة مدركة للطبقة، تدقيق شامل append-only، طابور إشعارات، وأمان RLS + 2FA.

## الستاك

- **Postgres على Supabase** (سحابي، الحساب الثاني) — مصدر الحقيقة للمخطط في
  `supabase/migrations/`.
- **pgTAP** للاختبارات (TDD) على Postgres محلي زائل عبر Docker.
- لاحقًا (م١+): Next.js/Tailwind، استضافة VPS عبر Coolify/Dokploy.

## البنية

```
supabase/
  migrations/   # مصدر الحقيقة — ملف لكل مسؤولية (0001..0015 + enable_pgtap)
  tests/        # pgTAP: 00_helpers .. 09_seed + SC_COVERAGE.md
  seed.sql      # المصادر المرشّحة (القرآن approved + ٧ proposed)
  config.toml
scripts/
  db-dump.sh    # نسخ احتياطي (schema + data + roles) بطابع زمني
specs/001-m0-database-core/   # spec · plan · tasks · data-model · contracts
docs/            # CONCEPT · GAPS · HANDOFF (مصدر القرارات)
```

## المتطلبات

- [Supabase CLI](https://supabase.com/docs/guides/local-development)
- Docker (للمكدّس المحلي والاختبارات)

## الأوامر

```bash
# تشغيل المكدّس المحلي (Docker)
supabase start

# تطبيق كل الترحيلات + seed.sql على المحلي (المحلي فقط — آمن للتصفير)
supabase db reset

# تشغيل كامل اختبارات pgTAP (المتوقّع: 214 ناجحة)
supabase db reset && supabase test db

# الدفع للسحابي (بعد supabase login + supabase link --project-ref <REF>)
supabase db push

# نسخة احتياطية (السحابي المربوط افتراضيًا؛ --local للمحلي)
./scripts/db-dump.sh
./scripts/db-dump.sh --local
```

## بوابة المراجعة

لا نشر يتخطّى الطبقات — **حتى للمدير**. الهيكل: `draft → submitted →
shariah_approved → approved → published` بالأدوار. الترجمة: تحريري فقط
(`draft → submitted → approved → published`)، ولا تُنشر إلا والهيكل الأب منشور.
مفروضة بـ trigger + RLS، ومدقّقة في `audit_log` (غير قابل للتعديل/الحذف).

## النسخ الاحتياطي وأرشفة NAS الأسبوعية (قرار ٤٣)

`scripts/db-dump.sh` يُنتج ثلاثة ملفات بطابع زمني UTC في `backups/`
(مُستثناة من Git): المخطط، البيانات، الأدوار.

**الأرشفة الأسبوعية على NAS** (الإعداد الفعلي للمجدول = مهمة سيرفر لاحقة):

1. على السيرفر، مهمة `cron` أسبوعية (مثلًا الجمعة 03:00):
   ```cron
   0 3 * * 5  cd /srv/seerah && BACKUP_DIR=/srv/seerah/backups ./scripts/db-dump.sh >> /var/log/seerah-backup.log 2>&1
   ```
2. مزامنة `backups/` إلى الـ NAS (عبر مشاركة مركّبة أو SSH):
   ```bash
   rsync -a --delete /srv/seerah/backups/ /mnt/nas/seerah/backups/
   ```
3. **الاحتفاظ:** احذف النسخ الأقدم من المدة المقرّرة (مثلًا 12 أسبوعًا) على الـ NAS.
4. السجلات (audit_log) جزء من dump البيانات، فتُؤرشَف ضمنه.

> التسليم الفعلي للإشعارات (تيليجرام) وأي مجدول (cron/Edge Function) = إعداد
> سيرفر لاحق؛ موثّق هنا ولم يُنفَّذ في م٠.

## قواعد ثابتة (مُلزِمة)

- **الترحيلات = مصدر الحقيقة.** أي تغيير مخطط = **ترحيل جديد + `supabase db push`**.
- **ممنوع التعديل المباشر على السحابي** (لوحة Supabase / SQL مباشر / MCP).
- **ممنوع `supabase db reset` على الريموت إطلاقًا** (مبدأ صون البيانات — السحابي لا يُصفَّر).
- الكتابة/المراجعة/الإدارة تتطلب **2FA (aal2)**.
- لا حذف فيزيائي — الحذف ناعم (`deleted_at`).

---

# م١ — أداة الإدخال/المحرّر (Next.js)

تطبيق **Next.js 15 (App Router) + React 19 + Tailwind v3 (RTL عربي)** يستهلك قاعدة م٠
السحابية كما هي — **صفر تغيير على المخطط** (يفرضه حارس `tests/unit/no-m1-migrations.test.ts`).
كل الفرض الفعلي يبقى في م٠ (RLS + المحفّزات)؛ الواجهة تعكسه ولا تستبدله.

## الستاك والبنية (م١)

```
app/
  (auth)/        # login · mfa · mfa/recovery  (مسارات عامة)
  (admin)/       # claims · entities · sources · review · admin  (محمية: aal2 + دور)
lib/
  supabase/      # client (anon) · server (anon+جلسة) · admin (service_role، "server-only")
  auth/          # assertAal2 · roles · requireAal2Staff · recovery · actions
  data/          # optimistic (قفل تفاؤلي على updated_at)
  claims/ review/ narrative/ sources/ editor/   # منطق + أفعال خادمية لكل قصّة
tests/unit/  tests/integration/  tests/e2e/
```

## المتطلبات (م١)

- Node **≥ 22.13** (`.nvmrc` = 22)، pnpm **11.8.0** (`corepack enable`).
- مكدّس Supabase محلي زائل (Docker) للاختبارات — لا يمسّ السحابي.

## المتغيّرات البيئية

انسخ `.env.example` إلى `.env`. **حدّ أمني (SC-008):**

| المتغيّر | الجانب | ملاحظة |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | عميل + خادم | عام |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | عميل + خادم | عام (كل كتابة تمرّ بـ RLS+aal2) |
| `SUPABASE_SERVICE_ROLE_KEY` | **خادم فقط** | **ممنوع** في المتصفّح؛ يُستورد عبر `lib/supabase/admin.ts` المحروس بـ `import "server-only"` |
| `DATABASE_URL` | اختبار فقط | لاختبارات التكامل/الأدوار عبر pg المباشر |

## التشغيل والاختبار

```bash
pnpm install            # (corepack enable أولًا)
pnpm dev                # تطوير

pnpm typecheck          # tsc صارم
pnpm build              # بناء إنتاجي (standalone)
pnpm test               # كل اختبارات الوحدة (Vitest)
pnpm test:integration   # تكامل عبر pg (يحتاج DATABASE_URL؛ يتخطّى بدونه)
pnpm test:e2e:check     # Playwright E2E ثم حكم الحالة (يحتاج مكدّسًا محليًّا + المفاتيح)
```

> **E2E يحتاج المكدّس المحلي:** `supabase db reset` ثم تصدير المفاتيح الثلاثة
> (`NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY`)
> **في عملية خادم Next التي يشغّلها Playwright**، و `DATABASE_URL` لاختبارات الأدوار/النطاق.
> راجع `specs/002-m1-authoring-tool/quickstart.md`.

## النشر (Coolify / Contabo) — إعداد فقط

`Dockerfile` (بناء standalone متعدد المراحل، مستخدم غير جذري) + `.dockerignore` جاهزان.

1. في Coolify: مصدر = هذا المستودع، Build Pack = **Dockerfile**، المنفذ `3000`.
2. متغيّرات البيئة في Coolify (وقت التشغيل): الثلاثة أعلاه — **`SUPABASE_SERVICE_ROLE_KEY`
   سرّ خادمي، لا يُمنح بادئة `NEXT_PUBLIC_` إطلاقًا**.
3. لا أسرار تُخبز في الصورة (التطبيق ديناميكي؛ `.env` مستثنى عبر `.dockerignore`).

> **النشر الحيّ على الإنترنت إجراء خارجي ينتظر إذن المالك الصريح** — هذا الإعداد لا ينشر.

## تدقيق RTL/الوصولية (T044)

- الجذر: `<html lang="ar" dir="rtl">`؛ التنسيق بخصائص **منطقية/متماثلة** فقط
  (`gap`/`p`/`space-y`) — لا `ml-/mr-/pl-/pr-/left-/right-/text-left/right` تكسر RTL.
- كل حقول الإدخال/القوائم لها اسم وصول برمجي (`aria-label`)، لا اعتماد على `placeholder` وحده.
- كل صفحة لها عنوان `h1`؛ الرسائل (خطأ/نجاح) نصّية مرئية.

## الحدود المعروفة (م١، موثّقة)

- محرّرا المعلومة/السرد يدعمان جلسة الإنشاء؛ تحرير سجلّ قائم يحتاج «تحميل» أولًا (MVP).
- الربط الذكي: مطابقة `ilike` ساذجة لا تتجاوز التشكيل/تنويعات الحروف؛ واقتراح المصادر
  معروض في محرّر السرد للاطّلاع (ربط المصدر الفعلي في محرّر المعلومة لاحقًا).
- «اعتماد المصدر للمدير» و«الربط بمصدر معتمد» قواعد **تطبيقية** (لا سند DB في م٠).
