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
