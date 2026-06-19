# Contract — آلة حالات المراجعة (Review State Machine)

> عقد ملزم: الانتقالات المسموحة + الدور الذي يصنع كلًّا. يُفرض بـ trigger للجميع (حتى المدير/postgres) + RLS بالدور (D7). أي انتقال خارج هذا الجدول يُرفض بـ exception.

## الحالات (review_states)

`draft` → `submitted` → `shariah_approved` → `approved` → `published`
حالات جانبية: `needs_revision` · `rejected`

## جدول الانتقالات المسموحة + الدور الفاعل

| from_code | to_code | الدور المخوّل | المعنى |
|-----------|---------|----------------|--------|
| `draft` | `submitted` | author | رفع للمراجعة |
| `submitted` | `shariah_approved` | shariah_reviewer | إجازة شرعية |
| `submitted` | `needs_revision` | shariah_reviewer | إرجاع لتعديل |
| `submitted` | `rejected` | shariah_reviewer | رفض |
| `shariah_approved` | `approved` | editor | اعتماد تحريري |
| `shariah_approved` | `needs_revision` | editor | إرجاع لتعديل |
| `shariah_approved` | `rejected` | editor | رفض تحريري |
| `approved` | `published` | admin | نشر |
| `approved` | `needs_revision` | admin | إرجاع قبل النشر |
| `published` | `approved` | admin | سحب النشر |
| `needs_revision` | `submitted` | author | إعادة رفع بعد التعديل |

## قواعد الفرض (ملزمة)

1. **منع القفز للجميع:** أي `(from,to)` غير موجود في الجدول يُرفض — **حتى للمدير و دور postgres**. (لا قفز draft→published.)
2. **الفرض بالدور:** التحوّل المسموح يجب أن يصنعه **الدور المخوّل** له فقط (تُقارن OLD.code→NEW.code فعليًا بدور المستخدم الحالي). لا `can_make_transition(x,x)` (لا-عملية)، ولا تجاوز بمجرد `auth.uid() IS NOT NULL`.
3. **طبقتان (D6):** آلة الحالات نفسها تُطبَّق على كيان الهيكل (المراجعة الشرعية) وعلى كل ترجمة (المراجعة التحريرية)، كلٌّ بحالته المستقلة.
4. **R2 (أمانة العرض):** عند `shariah_approved`/`approved` يُسجَّل المُراجِع الفعلي (actor) في التدقيق؛ لا تُعرض شارة مراجعة بلا مُراجِع مسجّل.
5. **anon:** لا يصنع أي انتقال؛ يقرأ `published` فقط.

## سيناريوهات اختبار pgTAP (عقد قابل للتحقق)

- `draft→published` مباشرة → يُرفض (P0001) حتى بدور postgres. ✅ (05_state_machine)
- `draft→submitted` بدور author → يُقبل؛ بدور shariah_reviewer → يُرفض. ✅
- `submitted→published` (قفز فوق طبقتين) → يُرفض. ✅
- `submitted→shariah_approved` بدور editor (دور خاطئ) → يُرفض؛ بدور shariah_reviewer → يُقبل. ✅
- `approved→published` بدور author → يُرفض؛ بدور admin → يُقبل. ✅
