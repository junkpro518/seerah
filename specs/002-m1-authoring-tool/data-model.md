# Phase 1 — Data Model: م١ أداة الإدخال/المحرّر

> **م١ لا يُعرّف أي جدول/عمود جديد.** المخطط كله من م٠ (`supabase/migrations/0001..0015`). هذا المستند يوثّق **كيف تستهلك الواجهة مخطط م٠** + أشكال البيانات (jsonb/metadata) التي تكتبها داخل أعمدة قائمة. أي حاجة لـ DDL = توقّف واسأل المالك (ترحيل منفصل في مسار م٠).

## 1) كيانات م٠ التي تعمل عليها الواجهة (مرجع، بلا تغيير)

| الكيان (م٠) | استخدام الواجهة | حارس RLS (م٠) |
|-------------|------------------|----------------|
| `profiles` / `roles` | تحديد الدور وما يُعرض/يُسمح | قراءة الذات أو admin؛ تغيير الدور admin+aal2 |
| `events`/`persons`/`locations` | الهيكل + حالة المراجعة + السرد عبر الترجمات | anon=published؛ staff=الكل؛ كتابة staff+aal2 |
| `claims` / `claim_citations` | محرّر المعلومة (حاوية واحدة، درجة، ربط استشهادات) | كتابة staff+aal2؛ قيود الحاوية/الحكم من م٠ |
| `sources` / `citations` | اقتراح/اعتماد المصادر؛ الربط من approved فقط | anon=approved؛ كتابة staff+aal2 |
| `*_translations` | السرد الغني لكل لغة (`body jsonb`,`body_plain`,`slug`,حالة) | الظهور= published+الهيكل published |
| `review_transitions` + حالات المراجعة | تحديد الأزرار المتاحة لكل دور/طبقة | قراءة admin؛ الفرض عبر trigger م٠ |
| `audit_log` / `notification_outbox` | عرض للمدير فقط | قراءة admin فقط |

> القواعد الفعلية (حاوية واحدة، حكم⇐مصدر، ≥١ استشهاد عند التقديم، آلة الحالات، aal2) **مفروضة في م٠**؛ الواجهة تعكسها وتمنع مبكرًا لتجربة أفضل، لكن لا تعتمد عليها كحارس.

## 2) عقدة claim_ref داخل `body jsonb` (لا تغيير مخطط — بيانات في عمود قائم)

`*_translations.body` (jsonb حرّ من م٠) يستوعب عُقَد TipTap. شكل عقدة الإشارة:

```json
{ "type": "claimRef", "attrs": { "claimId": "<uuid>" } }
```

- تُدمَج inline داخل الفقرات مع عُقَد النص العادية.
- **الترقيم `[n]`** يُشتق وقت العرض: امسح الوثيقة بالترتيب، رقّم ظهور `claimRef` تصاعديًا لكل لغة. لا تخزين.
- **`body_plain`** يبقى مشتقًّا تلقائيًا في م٠ (trigger 0010 يتجاهل عُقَد الإشارة) — الواجهة لا تكتبه.
- **الهايلايت:** يُقرأ `doc_grade_code`/`claim_type_code` للمعلومة المشار إليها، ولونها من جدول القائمة المرجعية (`color`)، ويُطبَّق كـ decoration بصري في المحرّر فقط.

## 3) القفل التفاؤلي عبر `updated_at` القائم (لا عمود جديد)

- كل جداول م٠ القابلة للتعديل لها `updated_at` يضبطه trigger `set_updated_at` (م٠).
- **بروتوكول الحفظ:** العميل يحمل `updated_at` وقت الفتح → عند الحفظ:
  `update <table> set ... where id = $id and updated_at = $loaded_updated_at`.
  - صف متأثّر = ١ → نجح (وtrigger م٠ يحدّث updated_at من جديد).
  - صف متأثّر = ٠ → **تعارض**: الصف تغيّر منذ الفتح → تحذير وإعادة تحميل، لا كتابة فوق.

## 4) الرموز الاحتياطية لـ 2FA — في `auth.users.app_metadata` (بيانات لا DDL)

> ✅ معتمَد (المالك 2026-06-22): app_metadata، بلا DDL. لا جدول مخصّص.

- عند تسجيل 2FA: تُولَّد N رموز، تُعرض مرة، وتُخزَّن **مجزّأة** في `app_metadata.mfa_recovery` (مصفوفة hashes) عبر admin API (خادم).
- عند الاستعادة: يُطابَق الرمز المُدخَل بأحد الـ hashes (خادم) → يُحذف العامل ويُحذف الرمز المستهلَك → يُعاد التسجيل.
- لا مسّ لمخطط public؛ `app_metadata` عمود metadata قائم تديره Supabase Auth.

## 5) تتبّع المتطلبات → عنصر بيانات

| FR | عنصر |
|----|------|
| FR-002/003 | Supabase MFA factors (TOTP) + AAL2 |
| FR-005 | `auth.users.app_metadata.mfa_recovery` (hashes) + admin reset |
| FR-006..010 | `claims`/`claim_citations`/`sources` (قيود م٠) |
| FR-012..016 | `*_translations.body` (عقدة claimRef) + body_plain (م٠) |
| FR-017..019 | `review_transitions` + آلة حالات م٠ |
| FR-020/021 | `sources.status_code` |
| FR-023..025 | RLS م٠ + جلسة المستخدم/anon + service role خادم فقط |
| FR-030 | `updated_at` (قفل تفاؤلي) |

**خلاصة:** صفر جداول/أعمدة جديدة. كل ما تكتبه م١ يقع داخل أعمدة م٠ القائمة (`body jsonb`, `updated_at`, `auth app_metadata`).
