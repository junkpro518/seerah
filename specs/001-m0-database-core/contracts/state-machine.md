# Contract — آلة حالات المراجعة (Review State Machine) — نموذج مدرك للطبقة

> **معتمد نهائيًا (س٥ + تنقيح المالك، 2026-06-19):** طبقتان. **الهيكل** يأخذ السلسلة الكاملة (شرعي ثم تحريري ثم نشر). **الترجمة** تحريرية فقط (حكم الحقيقة محايد لغويًا — لا إعادة مراجعة شرعية)، مع استثناء بلا مسار جديد. يُفرض بـ trigger للجميع (حتى المدير/postgres) + RLS بالدور والطبقة.

## الطبقتان

- **الهيكل (structure)** = الحقيقة (event/person/location/claim): مراجعة **شرعية ثم تحريرية ثم نشر**.
- **الترجمة (translation)** = نص كل لغة (`*_translations`): مراجعة **تحريرية ثم نشر** فقط.

## جدول الانتقالات المدرك للطبقة (`review_transitions`)

`review_transitions(layer, from_code, to_code, role_code, PK(layer, from_code, to_code))` — كله بـ `code` (FK لـ review_states/roles).

### طبقة الهيكل (شرعي → تحريري → نشر)

| from_code | to_code | الدور |
|-----------|---------|-------|
| `draft` | `submitted` | author |
| `submitted` | `shariah_approved` | shariah_reviewer |
| `submitted` | `needs_revision` | shariah_reviewer |
| `submitted` | `rejected` | shariah_reviewer |
| `shariah_approved` | `approved` | editor |
| `shariah_approved` | `needs_revision` | editor |
| `shariah_approved` | `rejected` | editor |
| `approved` | `published` | admin |
| `approved` | `needs_revision` | admin |
| `published` | `approved` | admin (سحب نشر) |
| `needs_revision` | `submitted` | author |

### طبقة الترجمة (تحريري → نشر فقط — بلا مراجعة شرعية)

| from_code | to_code | الدور | شرط/ملاحظة |
|-----------|---------|-------|------------|
| `draft` | `submitted` | author | — |
| `submitted` | `approved` | editor | — |
| `submitted` | `needs_revision` | editor | **الاستثناء:** هنا يُرجِع المحرّر ترجمةً فيها تأدية نصّ مقدّس/معنى حسّاس لمراجعة شرعية — **بإعادة استخدام `needs_revision`، بلا حالة/مسار جديد** |
| `submitted` | `rejected` | editor | — |
| `approved` | `published` | admin | **شرط:** الهيكل الأب = `published` |
| `approved` | `needs_revision` | admin | — |
| `published` | `approved` | admin | سحب نشر |
| `needs_revision` | `submitted` | author | بعد التعديل/المراجعة الشرعية إن طُلبت |

> **لا مراجعة شرعية في مسار الترجمة** (الحكم محايد لغويًا)؛ الاستثناء النادر يُدار عبر `needs_revision` القائم.

## قاعدة الظهور (Visibility) — لبنة ٣٤

**ظاهر بلغة L** ⇔ `structure.review_status = 'published'` **AND** `translation[L].review_status = 'published'`.
- غير ذلك → رجوع للعربية (إن كانت ظاهرة) مع إشارة عدم توفّر الترجمة؛ وإلا لا يُعرض.
- anon يقرأ ما هو "ظاهر" فقط.

## قواعد الفرض (ملزمة)

1. **منع القفز للجميع:** أي `(layer, from, to)` غير موجود يُرفض — **حتى للمدير ودور postgres** (مثل `draft→published`، أو `shariah_approved` على الترجمة).
2. **الفرض بالدور:** التحوّل يصنعه **الدور المخوّل** في صف الجدول فقط (تُقارن OLD.code→NEW.code فعليًا بدور المستخدم). **لا `can_make_transition(x,x)` (لا-عملية)، ولا تجاوز بمجرد `auth.uid() IS NOT NULL`.**
3. **الشرط بين الطبقتين:** ترجمة لا تبلغ `published` إلا والهيكل الأب `published` (يُفحص في trigger الترجمة) — يضمن ثابت الظهور.
4. **الطبقة من سياق الـ trigger:** trigger الهيكل يمرّر `layer='structure'`؛ trigger `*_translations` يمرّر `layer='translation'` (عبر TG_ARGV).
5. **R2 (أمانة العرض):** المُراجِع الفعلي (actor) يُسجَّل في التدقيق عند `shariah_approved`/`approved`/`published`؛ لا شارة بلا مُراجِع مسجّل.

## سيناريوهات اختبار pgTAP (عقد قابل للتحقق)

**الهيكل:**
- `draft→published` مباشرة → يُرفض (P0001) حتى لـ postgres.
- `draft→submitted` author يُقبل / shariah_reviewer يُرفض.
- `submitted→shariah_approved` editor يُرفض / shariah_reviewer يُقبل.
- `shariah_approved→approved` shariah_reviewer يُرفض / editor يُقبل.
- `approved→published` editor يُرفض / admin يُقبل.

**الترجمة:**
- أي انتقال إلى `shariah_approved` على الترجمة → يُرفض (غير موجود في طبقتها).
- `submitted→approved` author يُرفض / editor يُقبل.
- `approved→published` والهيكل الأب ليس `published` → يُرفض (الشرط بين الطبقتين)؛ والهيكل published + admin → يُقبل.
- `submitted→needs_revision` editor يُقبل (مسار الاستثناء للمقدّس).

**الظهور:**
- الهيكل published + ترجمة ar published → ar ظاهرة؛ ترجمة en approved (غير published) → en غير ظاهرة (رجوع لـ ar مع إشارة).
