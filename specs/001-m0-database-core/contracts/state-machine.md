# Contract — آلة حالات المراجعة (Review State Machine) — نموذج مدرك للطبقة

> **معتمد (س٥، 2026-06-19):** طبقتان مستقلتان، كلٌّ سلسلتها الخاصة (لا تكرار خط الأنابيب). يُفرض بـ trigger للجميع (حتى المدير/postgres) + RLS بالدور. أي انتقال خارج جدول طبقته يُرفض بـ exception.

## الطبقتان

- **الهيكل (structure)** = الحقيقة (event/person/location/claim): المراجعة **الشرعية** (sourcing/grade).
- **الترجمة (translation)** = نص كل لغة (`*_translations`): المراجعة **التحريرية** (الصياغة).

## جدول الانتقالات المدرك للطبقة (`review_transitions`)

`review_transitions(layer text, from_code text, to_code text, role_code text, PK(layer, from_code, to_code))` — كله بـ `code` (FK لـ review_states/roles).

### طبقة الهيكل (شرعي)

| from_code | to_code | الدور |
|-----------|---------|-------|
| `draft` | `submitted` | author |
| `submitted` | `shariah_approved` | shariah_reviewer |
| `submitted` | `needs_revision` | shariah_reviewer |
| `submitted` | `rejected` | shariah_reviewer |
| `needs_revision` | `submitted` | author |

> الهيكل ينتهي عند `shariah_approved` (الحقيقة موثّقة شرعيًا). لا `published` على الهيكل.

### طبقة الترجمة (تحريري)

| from_code | to_code | الدور | شرط إضافي |
|-----------|---------|-------|-----------|
| `draft` | `submitted` | author | — |
| `submitted` | `approved` | editor | الهيكل الأب = `shariah_approved` |
| `submitted` | `needs_revision` | editor | — |
| `submitted` | `rejected` | editor | — |
| `approved` | `published` | admin | الهيكل الأب = `shariah_approved` |
| `published` | `approved` | admin | سحب نشر |
| `needs_revision` | `submitted` | author | — |

## قاعدة الظهور (Visibility)

**ظاهر بلغة L** ⇔ `structure.review_status = 'shariah_approved'` **AND** `translation[L].review_status = 'published'`.
- غير ذلك → رجوع للعربية مع إشارة عدم توفّر الترجمة (منطق عرض، م٦؛ البيانات جاهزة الآن).
- anon يقرأ ما هو "ظاهر" فقط.

## قواعد الفرض (ملزمة)

1. **منع القفز للجميع:** أي `(layer, from, to)` غير موجود يُرفض — **حتى للمدير ودور postgres** (مثل `draft→published` على الترجمة، أو أي `published` على الهيكل).
2. **الفرض بالدور:** التحوّل يصنعه **الدور المخوّل** في صف الجدول فقط (تُقارن OLD.code→NEW.code فعليًا بدور المستخدم). **لا `can_make_transition(x,x)` (لا-عملية)، ولا تجاوز بمجرد `auth.uid() IS NOT NULL`.**
3. **الشرط بين الطبقتين:** ترجمة لا تبلغ `approved`/`published` إلا والهيكل الأب `shariah_approved` (يُفحص في trigger الترجمة).
4. **الطبقة من سياق الـ trigger:** trigger الهيكل يمرّر `layer='structure'`؛ trigger `*_translations` يمرّر `layer='translation'` (عبر TG_ARGV).
5. **R2 (أمانة العرض):** المُراجِع الفعلي (actor) يُسجَّل في التدقيق عند `shariah_approved` (شرعي) و`approved`/`published` (تحريري)؛ لا شارة بلا مُراجِع مسجّل.

## سيناريوهات اختبار pgTAP (عقد قابل للتحقق)

**الهيكل:**
- `draft→shariah_approved` مباشرة → يُرفض (P0001) حتى لـ postgres.
- `draft→submitted` بدور author يُقبل، بدور shariah_reviewer يُرفض.
- `submitted→shariah_approved` بدور editor يُرفض، بدور shariah_reviewer يُقبل.
- أي انتقال إلى `published` على الهيكل → يُرفض (غير موجود في طبقته).

**الترجمة:**
- `submitted→approved` والهيكل الأب ليس `shariah_approved` → يُرفض (الشرط بين الطبقتين).
- `submitted→approved` بدور author → يُرفض، بدور editor (والهيكل shariah_approved) → يُقبل.
- `approved→published` بدور editor → يُرفض، بدور admin → يُقبل.
- `draft→published` مباشرة → يُرفض.

**الظهور:**
- الهيكل shariah_approved + ترجمة ar published → ar ظاهرة؛ ترجمة en draft → en غير ظاهرة (رجوع لـ ar).
