# Implementation Plan: م٠ — نواة قاعدة البيانات (M0 Database Core)

**Branch**: `001-m0-database-core` | **Date**: 2026-06-19 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-m0-database-core/spec.md`

## Summary

بناء نواة قاعدة بيانات Postgres (على Supabase سحابي، حساب ثانٍ) للموسوعة: مخطط متعدد اللغات (طبقة هيكل + جداول ترجمة لكل كيان)، قوائم مرجعية code-keyed مترجَمة، معلومات مفردة موثّقة بقيد "حاوية واحدة" وقيد "حكم⇐مصدر حكم"، بوابة مراجعة إلزامية كآلة حالات مفروضة بـ trigger + RLS للجميع (حتى المدير)، تدقيق شامل append-only عبر trigger عام، حذف ناعم في كل مكان، body_plain مشتق، وخطّافات (outbox للإشعارات + تصدير NAS موثّق). كل ذلك مبنيٌّ بـ TDD (pgTAP) على قاعدة محلية زائلة، ثم يُدفع للسحابي عبر `supabase db push`. Git مصدر الحقيقة.

**المقاربة:** ملف migration واحد لكل مسؤولية؛ اختبارات pgTAP منفصلة تُكتب وتفشل أولًا؛ الانتقالات في trigger مركزي واحد؛ التدقيق في دالة عامة واحدة؛ كل القوائم الثابتة جداول مرجعية.

## Technical Context

**Language/Version**: SQL (PostgreSQL 15، نكهة Supabase) + bash لسكربتات التشغيل. لا لغة تطبيق في م٠.

**Primary Dependencies**: Supabase CLI 2.75 · PostgreSQL 15 · pgTAP · Git. (Next.js مؤجّل لـ م١.)

**Storage**: Supabase سحابي مُدار (Postgres) على **الحساب الثاني** = القاعدة الحقيقية؛ + Postgres محلي **زائل** (عبر `supabase start`/Docker) لحلقة الاختبار فقط.

**Testing**: pgTAP عبر `supabase test db` على المكدّس المحلي الزائل (أحمر→أخضر)، قبل أي دفع للسحابي.

**Target Platform**: Supabase سحابي (Postgres مُدار).

**Project Type**: مشروع قاعدة بيانات/مخطط (هيكل أحادي تحت `supabase/`). لا واجهة في م٠.

**Performance Goals**: غير حرج في م٠ (حجم محتوى صغير، إدخال يدوي)؛ فهارس أساسية على review_status وأعمدة الربط وslug تكفي.

**Constraints**: Git مصدر الحقيقة (تغيير المخطط عبر migration فقط، لا SQL مباشر عبر MCP/لوحة) · RLS مفعّل على كل الجداول · audit_log append-only · TDD غير قابل للتفاوض · السحابي لا يُصفَّر إطلاقًا (مبدأ VI).

**Scale/Scope**: ١٢ كيان هيكل + ٤ جداول ترجمة + ~١٠ جداول مرجعية + جداول تسمياتها + outbox + audit_log. النطاق م٠ فقط.

## Constitution Check

*GATE: يجب أن يمرّ قبل Phase 0، ويُعاد تقييمه بعد Phase 1. أي "FAIL" غير مبرَّر = إيقاف.*

| # | المبدأ | البوابة (كيف تتحقق في م٠) | الحالة |
|---|--------|---------------------------|--------|
| I | ننقل فقط | قيد DB: claim نوعه "حكم" يتطلب `grading_source` غير فارغ (TRIM)؛ النصوص المقدّسة تُنقل لا تُولَّد (سياسة إدخال) | ✅ PASS |
| II | لكل معلومة مصدر/درجة | claim بلا claim_citation يُرفض؛ claim بلا درجة يُرفض؛ sources تمرّ بحالة اعتماد قبل الاستشهاد | ✅ PASS |
| III | بوابة المراجعة للجميع | trigger الانتقالات يفرض الجدول على الكل (بما فيه postgres/admin)؛ RLS يقيّد مَن يصنع أي انتقال بالدور؛ anon يقرأ المنشور فقط | ✅ PASS |
| IV | التدقيق الشامل | trigger عام SECURITY DEFINER على كل جداول المحتوى (to_jsonb OLD/NEW)؛ RLS يمنع UPDATE/DELETE على audit_log للجميع؛ لا INSERT مباشر للمستخدم | ✅ PASS |
| V | متعدد اللغات | طبقة هيكل + جدول ترجمة لكل كيان (entity_id, lang)؛ review_status للترجمة؛ slug لكل لغة؛ رجوع للعربي وقت العرض | ✅ PASS |
| VI | صون البيانات وسلامتها | deleted_at + partial unique WHERE deleted_at IS NULL؛ CHECK num_nonnulls(...)=1؛ body_plain مشتق؛ السحابي لا يُصفَّر | ✅ PASS |
| VII | المواصفات أولًا والاختبار أولًا | **بوابة TDD صارمة (انظر أدناه)** — كل متطلب له اختبار pgTAP يفشل قبل التنفيذ | ✅ PASS (مفروضة في tasks) |
| VIII | الأمان والأدوار | profiles بأربعة أدوار code-keyed؛ RLS أقل-امتياز؛ سياسات الكتابة/المراجعة/الإدارة تتطلب `aal2` (2FA) | ✅ PASS |

**القيود التقنية/القانونية:** الستاك مطابق (Supabase/Postgres)؛ النصوص المقدّسة (مجمع الملك فهد) سياسة إدخال لا مخطط؛ الترخيص/الاقتباس خارج طبقة البيانات. ✅

### بوابة TDD الصارمة (توجيه المالك ٣ — تفشل فعلًا لا مجرد ملاحظة)

قاعدة ملزمة على كل مهمة تنفيذ في `tasks.md`:

> **لا يُكتب أي ملف migration قبل وجود اختبار pgTAP له شُغّل وفشل (أحمر) موثّقًا.** كل مهمة تنفيذ بنية إلزامية: (Step A) اكتب الاختبار · (Step B) `supabase test db` ويجب أن **يفشل** · (Step C) اكتب الـ migration · (Step D) `supabase test db` ويجب أن **ينجح** · (Step E) commit. مهمة بلا Step B فاشل = **بوابة مكسورة، يتوقّف التنفيذ**. تُرفض أي مهمة تنفيذ لا تسبقها مهمة اختبار مقابلة.

هذه البوابة تتجسّد بنيويًا في `tasks.md` (كل مهمة تنفيذ مسبوقة بمهمة اختبار ومرتبطة بها dependency)، ويتحقّق `speckit-analyze` لاحقًا من عدم وجود مهمة تنفيذ يتيمة بلا اختبار.

**استراتيجية ثبات الاختبارات (مهم — `supabase test db` يعيد تشغيل كل الملفات على المخطط النهائي):** الاختبارات المبكرة يجب ألّا تَضبط حالات متقدّمة مباشرةً (مثل `review_status='published'`) لأن trigger آلة الحالات (0011) وRLS (0014) سيرفضانها لاحقًا فتنقلب خضراءُها حمراء عند T032. القاعدة: **التجهيز يبدأ من `draft` ويصل للحالات عبر انتقالات صحيحة بالدور، أو عبر مُعِين اختبار `SECURITY DEFINER`/service-role يتخطّى RLS وآلة الحالات بنيّة معلنة** (يُعرَّف في `00_helpers.sql`). كل ملف اختبار يلتزم هذا حتى يبقى أخضر بعد كل الترحيلات.

## Project Structure

### Documentation (this feature)

```text
specs/001-m0-database-core/
├── plan.md              # هذا الملف
├── research.md          # Phase 0 — قرارات تقنية ومبرّراتها
├── data-model.md        # Phase 1 — المخطط التفصيلي (جداول/أعمدة/قيود/علاقات)
├── quickstart.md        # Phase 1 — دليل التحقق والتشغيل
├── contracts/
│   └── state-machine.md # عقد آلة حالات المراجعة (الانتقالات المسموحة + من يصنعها)
└── tasks.md             # Phase 2 — يولّده speckit-tasks (ليس الآن)
```

### Source Code (repository root)

```text
supabase/
├── config.toml                 # يولّده supabase init
├── migrations/                 # مصدر الحقيقة — ملف لكل مسؤولية، مرقّمة
│   ├── 0001_lookups.sql        # الجداول المرجعية + جداول تسمياتها + بذرة الأكواد
│   ├── 0002_languages_seed.sql # قائمة اللغات المدعومة (ar أولًا)
│   ├── 0003_profiles.sql       # المستخدمون والأدوار + current_role_name() + auto-profile + set_updated_at()
│   ├── 0004_sources_citations.sql  # المصادر (حالة اعتماد) + الاستشهادات + قيد grading_source
│   ├── 0005_content_entities.sql   # events/persons/locations (هيكل) + timeline_order + deleted_at
│   ├── 0006_translations.sql   # *_translations (entity_id, lang) + body jsonb + slug + review_status
│   ├── 0007_claims.sql         # claims (أعمدة منفصلة + CHECK واحد فقط) + claim_citations
│   ├── 0008_join_tables.sql    # event_persons / event_locations
│   ├── 0009_content_notes.sql  # الملاحظات الداخلية + is_public
│   ├── 0010_body_plain.sql     # دالة + trigger اشتقاق body_plain من body jsonb
│   ├── 0011_state_machine.sql  # جدول الانتقالات + trigger الفرض للجميع
│   ├── 0012_audit.sql          # audit_log + الدالة العامة + triggers على كل الجداول
│   ├── 0013_outbox.sql         # جدول outbox + trigger من audit_log للأحداث المهمة
│   └── 0014_rls.sql            # تفعيل RLS + كل السياسات (قراءة/كتابة/انتقال بالدور + aal2)
├── tests/                      # pgTAP — تُكتب وتفشل أولًا
│   ├── 00_helpers.sql          # انتحال مستخدم/دور/aal للاختبار
│   ├── 01_lookups.sql          # وجود الجداول المرجعية + بذرة الأكواد + التسميات
│   ├── 02_schema.sql           # وجود كيانات الهيكل وجداول الترجمة والأعمدة
│   ├── 03_constraints.sql      # grading_source · num_nonnulls=1 · partial unique · claim بلا استشهاد
│   ├── 04_translations.sql     # (entity_id,lang) فريد · review_status · body_plain مشتق
│   ├── 05_state_machine.sql    # منع القفز للجميع + الانتقالات الصحيحة
│   ├── 06_audit.sql            # التقاط OLD/NEW + append-only (لا UPDATE/DELETE حتى admin)
│   ├── 07_rls.sql              # anon يرى المنشور فقط · أقل-امتياز · aal2 للكتابة
│   └── 08_outbox.sql           # الأحداث المهمة تصل outbox
├── seed.sql                    # بذرة المصادر المرشّحة (proposed) + لغة ar
└── functions/                  # (مؤجّل) Edge Functions للإشعار/التصدير — خطّاف فقط في م٠

scripts/
└── db-dump.sh                  # تصدير محلي يدوي (يُمهّد لتصدير NAS)

docs/                           # موجود (CONCEPT/GAPS/HANDOFF)
```

**Structure Decision**: مشروع قاعدة بيانات أحادي تحت `supabase/`. الترتيب المرقّم للترحيلات يفرض ترتيب البناء (المرجعيات → الأدوار → المصادر → الكيانات → الترجمات → المعلومات → الربط → الملاحظات → body_plain → آلة الحالات → التدقيق → outbox → RLS). الاختبارات منفصلة ومرقّمة بالتوازي.

## Complexity Tracking

> لا انتهاكات للدستور تتطلب تبريرًا. كل التعقيد (جداول مرجعية بدل enums، طبقات ترجمة، trigger تدقيق عام) مطلوب مباشرة بقرارات معتمدة (s1/s2/s3 + مبادئ IV/V/VI)، لا تعقيد مضاربي.

| الاختيار | لماذا مطلوب | البديل الأبسط ولماذا رُفض |
|----------|-------------|---------------------------|
| جداول مرجعية بدل ENUM | قرار s2: تحمل تسميات مترجَمة + ألوان للعرض + توسعة بلا migration | ENUM أبسط لكنه بلا حقول عرض وتوسعته تحتاج migration وALTER TYPE مزعج |
| جدول ترجمة لكل كيان | قرار s1 + مبدأ V: سلامة مرجعية (FK حقيقي) ووضوح | جدول ترجمة متعدد الأشكال واحد — مرفوض لضعف السلامة المرجعية |
| trigger تدقيق عام | مبدأ IV: لا استثناء، حتى تشكيل حرف | تدقيق يدوي لكل جدول — مرفوض (ينسى/يُتجاوز) |
