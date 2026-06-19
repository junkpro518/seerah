# Phase 0 — Research & Decisions: م٠ نواة قاعدة البيانات

> القرارات التقنية ومبرّراتها. كلها مشتقة من قرارات معتمدة (CONCEPT/GAPS + جلسة التوضيح s1–s4 + توجيهات المالك). لا NEEDS CLARIFICATION متبقٍّ.

## D1 — القوائم الثابتة: جداول مرجعية code-keyed (لا ENUM)

- **القرار:** كل قائمة ثابتة = جدول `<list>(code text PK, color text null, sort_order int, is_active bool)` + جدول تسميات `<list>_labels(code, lang, label, PK(code,lang))`. كل الإشارات (FK، CHECK، آلة الحالات، RLS) إلى `code`.
- **المبرّر:** قرار s2 + لبنة ٢١ (تسميات وألوان للعرض) + لبنة ١٧ (المصادر/القوائم تتوسّع). الجداول المرجعية تحمل التسميات المترجَمة والألوان وتتوسّع بإدراج صف بلا migration/ALTER TYPE.
- **بدائل مرفوضة:** Postgres ENUM (لا يحمل حقول عرض، توسعته تحتاج migration وALTER TYPE داخل معاملة مزعج)؛ CHECK نصّي مضمّن (يفقد التسميات/الألوان والتفرّد المرجعي).
- **القوائم:** `doc_grades` (درجة التوثيق) · `confidence_levels` (ثقة التاريخ/المكان) · `review_states` · `claim_types` · `citation_relations` · `roles` · `languages` · `source_types` · `source_statuses` · `note_types`.

## D2 — تعدد اللغات: جدول ترجمة لكل كيان

- **القرار:** `event_translations` · `person_translations` · `location_translations` · `claim_translations`، مفتاح `(entity_id, lang)`؛ يحمل العنوان/الملخص/`body jsonb`/`slug`/`review_status`/`body_plain`/`deleted_at`.
- **المبرّر:** قرار s1 + مبدأ V. FK حقيقي لكل كيان (سلامة مرجعية)، slug وحالة مراجعة لكل لغة (لبنة ٢٩/٣٤).
- **بدائل مرفوضة:** جدول ترجمة واحد متعدد الأشكال (entity_type, entity_id, lang) — يضعف السلامة المرجعية ويعقّد الفهارس/القيود.

## D3 — نموذج ربط المعلومة بالنص (FR-040، الأهم)

- **القرار:** الحقيقة = `claims` (uuid مشترك، مصدر/درجة مرة واحدة في الهيكل). النص لكل لغة = `claim_translations`. الإشارات داخل سرد الكيان تعيش في `*_translations.body (jsonb)` كعلامات inline تحمل `claim_id`. الترقيم `[n]` **يُشتق وقت العرض** من ترتيب ظهور العلامات في `body` لكل لغة — **لا يُخزَّن**.
- **المبرّر:** لأن `body` JSONB، إضافة علامات إشارة المحرّر (م١) **لا تحتاج أي migration** — الحقل يستوعبها أصلًا. هذا يجسّد توجيه المالك ١ ولبنة ٣٣.
- **قابل للتحقق:** اختبار يثبت أن `claim` واحدًا يُشار إليه من نصّي لغتين مختلفتين بترقيم مستقل مشتق؛ ولا عمود ترقيم مخزّن.
- **بدائل مرفوضة:** جدول إشارات منفصل بمواضع رقمية مخزّنة (يحتاج إعادة حساب عند كل تحرير، ويخزّن ما يُشتق)؛ ترقيم مخزّن (يكسر مبدأ اشتقاق `[n]` لكل لغة).

## D4 — المعلومة: أعمدة حاوية منفصلة + قيد "واحد فقط"

- **القرار:** `claims(event_id uuid null, person_id uuid null, location_id uuid null, ... , CHECK (num_nonnulls(event_id, person_id, location_id) = 1))` مع FK لكل عمود.
- **المبرّر:** FR-009 + قرار A4. سلامة مرجعية حقيقية بدل `container_type/container_id` متعدد الأشكال (الذي لا يُفرض بـ FK).
- **بدائل مرفوضة:** المرجع متعدد الأشكال في الخطة القديمة (لا FK، يحتاج trigger للتحقق، أضعف).

## D5 — قيد "ننقل فقط" على مستوى الحكم

- **القرار:** الحكم ومصدره يعيشان على `citations` (grading + grading_source) بقيد `CHECK (grading IS NULL OR (grading_source IS NOT NULL AND btrim(grading_source) <> ''))`. ودرجة المعلومة `claims.doc_grade_code`؛ المعلومة التي درجتها من فئة "حكم حديث" تتطلب استشهادًا يحمل grading_source (يُفرض باختبار + قيد/trigger).
- **المبرّر:** مبدأ I + لبنة ٣/١١/٣٨. الفراغ يُعامل كغياب (btrim).
- **ملاحظة:** الموضع الأدق (citations مقابل claims) يُحسم في data-model؛ المبدأ: لا حكم بلا جهة مسمّاة، مفروض في DB.

## D6 — طبقتا المراجعة (s3، أبسط نموذج)

- **القرار:** كيان الهيكل (event/person/location/claim) يحمل `review_status` = المراجعة **الشرعية** (sourcing/grade). كل ترجمة تحمل `review_status` = المراجعة **التحريرية** (الصياغة). قاعدة الظهور بلغة L: `structure.review_status='published' AND translation[L].review_status='published'`؛ وإلا رجوع للعربية مع إشارة. طبقتان فقط، لا ثالثة.
- **المبرّر:** قرار s3 + توجيه المالك ٣ (أبقها بسيطة). يفصل المسؤوليتين دون إقحام مستويات.

## D7 — آلة حالات المراجعة (للجميع، بالدور، بلا أخطاء الخطة القديمة)

- **القرار:** `review_transitions(from_code, to_code)` (FK لـ review_states). دالة `enforce_review_transition()` (trigger BEFORE UPDATE على كل كيان ذي حالة): (أ) ترفض أي انتقال خارج الجدول **للجميع بما فيهم المدير/postgres**؛ (ب) تتحقق أن **دور المستخدم الحالي** مخوّل بهذا الانتقال المحدّد عبر مقارنة OLD→NEW حقيقية.
- **تصحيح أخطاء الخطة القديمة:** لا `can_make_transition(x,x)` (لا-عملية)؛ التحقق بالدور يقارن OLD.code→NEW.code فعليًا. لا اعتماد على `auth.uid() IS NOT NULL` وحده كباب خلفي؛ غياب المستخدم (سياق خدمة) لا يتخطّى **جدول** الانتقالات (المنع البنيوي يبقى).
- **الانتقالات:** draft→submitted (author) · submitted→{shariah_approved|needs_revision|rejected} (shariah_reviewer) · shariah_approved→{approved|needs_revision|rejected} (editor) · approved→{published|needs_revision} (admin) · published→approved (admin، سحب نشر) · needs_revision→submitted (author). [العقد الكامل في contracts/state-machine.md]

## D8 — الحذف الناعم + التفرّد الجزئي

- **القرار:** `deleted_at timestamptz null` على كل الجداول. كل تفرّد يصبح `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL` (slug لكل كيان، (entity_id,lang) للترجمات، (claim_id,citation_id)، ...). العروض/الاستعلامات الافتراضية تستثني `deleted_at IS NOT NULL`.
- **المبرّر:** مبدأ VI + ملاحظة المراجع: التفرّد الكامل يكسر إعادة استخدام slug/lang بعد الحذف الناعم؛ التفرّد الجزئي يحلّها.
- **بدائل مرفوضة:** UNIQUE كامل (يمنع إعادة الإدراج بعد حذف ناعم).

## D9 — body_plain مشتق تلقائيًا

- **القرار:** دالة `extract_plain(body jsonb) returns text` + trigger BEFORE INSERT/UPDATE على جداول الترجمة يملأ `body_plain`. للبحث العربي لاحقًا (م١٣) بلا إعادة هيكلة.
- **المبرّر:** FR-015 + قرار A5. الاشتقاق بالـ trigger يضمن التزامن دائمًا (لا اعتماد على التطبيق).
- **بدائل مرفوضة:** GENERATED column (لا يستطيع استدعاء دالة non-immutable على jsonb بسهولة عبر كل الحالات)؛ الاشتقاق في التطبيق (يكسر إن دخل SQL مباشر).

## D10 — التدقيق الشامل append-only

- **القرار:** `audit_log(id, table_name, row_id, op, old_data jsonb, new_data jsonb, actor uuid, actor_role, occurred_at)` + دالة عامة `audit_trigger()` **SECURITY DEFINER** تستخدم `to_jsonb(OLD)`/`to_jsonb(NEW)`، مربوطة AFTER INSERT/UPDATE/DELETE على كل جداول المحتوى (يشمل مسار الحذف الناعم لأنه UPDATE). RLS على audit_log: **لا SELECT إلا للمدير/المراجع حسب الحاجة، ولا INSERT/UPDATE/DELETE لأي دور** — الكتابة فقط عبر الدالة المالكة (definer). دخول/خروج الإداريين يُلتقط عبر Supabase Auth Hooks → صف في audit_log.
- **المبرّر:** مبدأ IV + لبنة ٢٥ + ملاحظة المراجع. SECURITY DEFINER يتيح للـ trigger الكتابة بينما يمنع RLS كتابة المستخدم المباشرة → append-only حقيقي.
- **قابل للتحقق:** اختبار يثبت أن UPDATE/DELETE على audit_log يفشل حتى بدور admin؛ وأن تغيير حرف تشكيل يُنتج صفًا.

## D11 — الخطّافات (بلا إفراط)

- **القرار:** `notification_outbox(id, event_type, payload jsonb, created_at, delivered_at null)` يملؤه trigger من audit_log للأحداث المهمة (دخول إداري/إدخال/رفع للمراجعة/اعتماد/نشر/رفض/اعتماد مرجع). تصدير NAS = **مهمة مجدولة موثّقة** (سكربت + توثيق) لا تسليم فعلي الآن.
- **المبرّر:** لبنة ٢٦/٤٣ + توجيه المالك ١٠ + ملاحظة المراجع: الخطّاف من م٠، التسليم لاحقًا. لا pg_net/pg_cron الآن.
- **بدائل مرفوضة:** ربط pg_net/Edge Function للتسليم الفوري في م٠ (إفراط، يحتاج توكن بوت غير متوفّر بعد).

## D12 — 2FA عبر AAL (لا عمود boolean)

- **القرار:** سياسات RLS للكتابة/المراجعة/الإدارة تتطلب `(auth.jwt()->>'aal') = 'aal2'`. "جاهزية م٠" = وجود هذه السياسات. لا عمود `is_2fa_enabled` في profiles.
- **المبرّر:** ملاحظة المراجع: Supabase يتتبّع MFA عبر مطالبة AAL في JWT؛ الفرض الصحيح بـ RLS لا بعمود مخصّص. (يُصحّح صياغة "علَم الحالة" في المواصفة.)
- **شرط بوابة (FR-042):** التفعيل الكامل (TOTP) إلزامي لكل عضو فريق حقيقي **قبل أول دخول له**.

## D13 — بيئة الاختبار والنشر

- **القرار:** حلقة pgTAP على Postgres محلي زائل (`supabase start`/Docker، `supabase test db`)؛ الترحيلات المعتمدة تُدفع للسحابي (الحساب الثاني) عبر `supabase db push`. السحابي لا يُصفَّر إطلاقًا.
- **المبرّر:** قرار المالك (صقل قرار ٢٠، دستور v1.0.1) + مبدأ VI.
- **اعتماد تنفيذي:** Task 0 يحتاج `supabase login` (الحساب الثاني) + project-ref من المالك. الخطة تُكتب الآن؛ التنفيذ موقوف على ذلك + موافقة plan/tasks.

## مخاطر ومعالجات

- **R-a:** فرض الانتقال-بالدور داخل trigger مع SECURITY DEFINER قد يخفي دور المستخدم → نقرأ الدور عبر `auth.uid()`/JWT لا عبر دور تنفيذ الدالة.
- **R-b:** auth hooks لالتقاط دخول/خروج قد تتطلب إعداد Supabase Auth Hooks → إن تعذّر في م٠ المبكر، نلتقط الأحداث المتاحة ونوثّق الفجوة (لا ندّعي تغطية غير محقّقة — R2/مبدأ الأمانة).
- **R-c:** `to_jsonb(OLD)` يلتقط الأعمدة كلها بما فيها الحسّاسة → audit_log محظور القراءة افتراضيًا (RLS) ويُقصر على الأدوار المخوّلة.
