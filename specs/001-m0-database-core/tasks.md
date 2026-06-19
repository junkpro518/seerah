# Tasks: م٠ — نواة قاعدة البيانات (M0 Database Core)

**Feature**: `001-m0-database-core` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Data model**: [data-model.md](./data-model.md)

> **بوابة TDD صارمة (ملزمة — plan §Constitution Check، توجيه المالك ٣):** كل وحدة مخطط لها **مهمة اختبار pgTAP تسبق** مهمة التنفيذ وتحجبها (impl blockedBy test). مهمة الاختبار = اكتب/وسّع ملف الاختبار + `supabase test db` ويجب أن **يفشل (أحمر)**. مهمة التنفيذ = اكتب الـ migration + `supabase test db` ويجب أن **ينجح (أخضر)** + commit. **لا migration بلا اختبار أحمر سابق.** أي مهمة تنفيذ بلا مهمة اختبار مقابلة = بوابة مكسورة → توقّف.

> **بيئة:** الحلقة على Postgres محلي زائل (`supabase start`)؛ الدفع للسحابي (الحساب الثاني) في الطور الأخير عبر `supabase db push` بعد الموافقة. السحابي لا يُصفَّر (مبدأ VI).

> **تصحيح ترتيب:** `languages` تُنشأ قبل بقية القوائم (جداول `*_labels` تشير إليها) — تنقيح طفيف لترقيم plan.

---

## Phase 1: Setup (تهيئة)

- [ ] T001 تهيئة Git/Supabase وإنشاء `.gitignore` (يضيف: `supabase/.branches`, `supabase/.temp`, `.env*`, `.DS_Store`, `backups/`, `node_modules/`) — `supabase init` في جذر المشروع. (يعتمد: Docker يعمل.)
- [ ] T002 تفعيل pgTAP: `supabase migration new enable_pgtap` ثم كتابة `create extension if not exists pgtap with schema extensions;` في `supabase/migrations/`؛ `supabase start` ثم `supabase db reset` (تحقّق: لا أخطاء). commit.
- [ ] T003 [P] بنية اختبار: `supabase/tests/00_helpers.sql` — دوال انتحال دور/مستخدم + ضبط `request.jwt.claims` بما فيه `aal` (aal1/aal2) + `as_anon()` + **مُعِين `seed_to_state()` (`SECURITY DEFINER`/service-role) يصل بصفٍّ لحالة متقدّمة عبر انتقالات صحيحة أو تخطٍّ معلن** — حتى تبقى الاختبارات المبكرة خضراء بعد ترحيلات آلة الحالات (0011) وRLS (0014). (راجع plan §استراتيجية ثبات الاختبارات.)

**Checkpoint:** مكدّس محلي يعمل، pgTAP مفعّل، دوال الاختبار جاهزة.

---

## Phase 2: Foundational (أساس حاجب لكل القصص) — القوائم والأدوار

> هذه الجداول مرجع لكل الكيانات (FK)؛ يجب أن تكتمل قبل أي كيان محتوى. (FR-003, FR-041, FR-031)

- [ ] T004 [US4] اختبار `supabase/tests/01_lookups.sql` (أحمر): وجود `languages` + بذرة `ar` (is_source, direction=rtl). `supabase test db` يجب أن يفشل.
- [ ] T005 تنفيذ `supabase/migrations/0001_languages.sql` (جدول languages + بذرة ar) → أخضر → commit. **[blockedBy T004]** — (FR-005/007)
- [ ] T006 [US4] توسيع `01_lookups.sql` (أحمر): وجود كل الجداول المرجعية + جداول `*_labels` + الأكواد المبذورة + تسميات `ar` (roles, review_states, doc_grades مع requires_grading_source، confidence_levels, claim_types, citation_relations, source_types, source_statuses, note_types). يفشل.
- [ ] T007 تنفيذ `supabase/migrations/0002_lookups.sql` (الجداول المرجعية + labels + بذرة الأكواد والتسميات العربية؛ كل الإشارات بـ code) → أخضر → commit. **[blockedBy T006]** — (FR-003/041, SC غير مباشر)
- [ ] T008 [US6] اختبار `supabase/tests/02_schema.sql` (أحمر): وجود `profiles` (role_code FK roles) + دالة `current_role_name()` + دالة/trigger `set_updated_at()`. يفشل.
- [ ] T009 [US6] تنفيذ `supabase/migrations/0003_profiles.sql` (profiles + `current_role_name()` SECURITY DEFINER — **لا `current_role` المحجوزة** + trigger auto-profile على auth.users + دالة مشتركة `set_updated_at()` تُربط بكل جدول له updated_at) → أخضر → commit. **[blockedBy T008]** — (FR-031)

**Checkpoint:** المرجعيات واللغات والأدوار جاهزة؛ يمكن بناء الكيانات.

---

## Phase 3: US2 — لكل معلومة مصدر ودرجة (P1) — المصادر والاستشهادات

> **هدف القصة:** لا توثيق بلا مصدر معتمد، ولا حكم بلا جهة. **اختبار مستقل:** إدراج استشهاد بحكم بلا grading_source يُرفض.

- [ ] T010 [US2] توسيع `supabase/tests/03_constraints.sql` (أحمر): استشهاد بحكم بلا grading_source يُرفض (23514)؛ بحكم+grading_source يُقبل؛ grading_source فراغات → يُرفض (btrim). + `02_schema` وجود sources/citations. يفشل.
- [ ] T011 [US2] تنفيذ `supabase/migrations/0004_sources_citations.sql` (sources status_code + citations + قيد `citation_grading_needs_source` + partial unique slug) → أخضر → commit. **[blockedBy T010]** — (FR-014/016, FR-012 جزئيًا؛ مبدأ I)

**Checkpoint:** قاعدة "ننقل فقط" مفروضة على مستوى الاستشهاد.

---

## Phase 4: US1/US4/US5 — كيانات الهيكل + الترجمة + المعلومة + الربط

> أكبر طور: يبني المحتوى متعدد اللغات وسلامته. (US1 أساس، US4 لغات، US5 سلامة/حذف ناعم)

- [ ] T012 [US5] توسيع `02_schema.sql` (أحمر): وجود events (timeline_order, approx_year_signed, deleted_at), persons (حقول تمييز), locations (geo_confidence_code). يفشل.
- [ ] T013 [US5] تنفيذ `supabase/migrations/0005_content_entities.sql` (events/persons/locations هيكل + review_status_code + deleted_at + partial unique حسب الحاجة + فهارس) → أخضر → commit. **[blockedBy T012]** — (FR-001/002/017/018/019)
- [ ] T014 [US4] توسيع `supabase/tests/04_translations.sql` (أحمر): `*_translations` بمفتاح (entity_id, lang)؛ partial unique (entity_id,lang) و(lang,slug) WHERE deleted_at IS NULL؛ تكرار (entity_id,lang) يُرفض؛ review_status_code للترجمة. يفشل.
- [ ] T015 [US4] تنفيذ `supabase/migrations/0006_translations.sql` (event/person/location/claim_translations + body jsonb + body_plain عمود + slug + review_status + partial unique) → أخضر → commit. **[blockedBy T014]** — (FR-004..008, FR-040 بنية)
- [ ] T016 [US2/US5] توسيع `03_constraints.sql` (أحمر): claims قيد `num_nonnulls(event_id,person_id,location_id)=1` (صفر أو اثنان يُرفض)؛ claim نوعه/درجته تتطلب grading_source بلا استشهاد مؤهّل يُرفض؛ claim بلا claim_citation عند submitted+ يُرفض. يفشل.
- [ ] T017 [US2/US5] تنفيذ `supabase/migrations/0007_claims.sql` (claims أعمدة منفصلة + CHECK one_container + doc_grade_code + display_order + deleted_at؛ claim_citations + relation_code + partial unique؛ trigger "حكم⇐مصدر حكم" + trigger "claim≥1 citation عند submitted+") → أخضر → commit. **[blockedBy T016, T011, T013]** — (FR-009/010/011/012/013, SC-004/005)
- [ ] T018 [US1] توسيع `02_schema.sql` (أحمر): وجود event_persons (participation_evidence, citation_id) و event_locations (order_index). يفشل.
- [ ] T019 [US1] تنفيذ `supabase/migrations/0008_join_tables.sql` (event_persons + event_locations + partial unique + فهارس) → أخضر → commit. **[blockedBy T018, T013]** — (FR-001)
- [ ] T020 [US7] توسيع `02_schema.sql` (أحمر): وجود content_notes (أعمدة حاوية + قيد one_container للأربعة + is_public default false + note_type_code). يفشل.
- [ ] T021 [US7] تنفيذ `supabase/migrations/0009_content_notes.sql` → أخضر → commit. **[blockedBy T020, T013]** — (FR-035)
- [ ] T022 [US5] توسيع `04_translations.sql` (أحمر): إدراج/تحديث body jsonb يشتق body_plain تلقائيًا (نص مجرّد مطابق). يفشل.
- [ ] T023 [US5] تنفيذ `supabase/migrations/0010_body_plain.sql` (دالة extract_plain + trigger BEFORE INSERT/UPDATE على كل `*_translations`) → أخضر → commit. **[blockedBy T022, T015]** — (FR-015, SC-007)

**Checkpoint:** المخطط متعدد اللغات كامل البنية، سلامة المعلومة وحذفها الناعم مفروضان، body_plain مشتق. (FR-040 محقّق بنيويًا: claims مشترك + body jsonb للإشارات + ترقيم مشتق وقت العرض.)

---

## Phase 5: US1 — بوابة المراجعة الإلزامية (P1) — آلة الحالات

> **هدف القصة:** لا نشر يتخطّى الطبقات حتى للمدير. **اختبار مستقل:** `draft→published` يُرفض للجميع.

- [ ] T024 [US1] اختبار `supabase/tests/05_state_machine.sql` (أحمر): `draft→published` يُرفض حتى بدور postgres (P0001)؛ `draft→submitted` بدور author يُقبل وبدور shariah_reviewer يُرفض؛ `submitted→published` يُرفض؛ `submitted→shariah_approved` بدور editor يُرفض وبدور shariah_reviewer يُقبل؛ `approved→published` بدور admin يُقبل وبدور author يُرفض. يفشل (لا trigger بعد). [راجع contracts/state-machine.md]
- [ ] T025 [US1] تنفيذ `supabase/migrations/0011_state_machine.sql` (review_transitions + بذرة الانتقالات؛ `enforce_review_transition()` trigger BEFORE UPDATE على events/persons/locations/claims و`*_translations`؛ يفرض الجدول للجميع + الدور بمقارنة OLD.code→NEW.code فعليًا — **بلا can_make_transition(x,x) وبلا تجاوز auth.uid وحده**) → أخضر → commit. **[blockedBy T024, T017, T015]** — (FR-021..025, SC-001؛ مبدأ III)

**Checkpoint:** بوابة المراجعة مفروضة بنيويًا للجميع.

---

## Phase 6: US3 — التدقيق الشامل (P1) — append-only

> **هدف القصة:** كل تغيير يُسجَّل، والسجل لا يُعبث به. **اختبار مستقل:** UPDATE/DELETE على audit_log يفشل حتى لـ admin.

- [ ] T026 [US3] اختبار `supabase/tests/06_audit.sql` (أحمر): تعديل صف (ولو حرف تشكيل) يُنتج صف audit بقيمة قديمة/جديدة كاملة + actor + occurred_at؛ **تغيير `profiles.role_code` واعتماد `sources.status_code` يُسجَّلان** (مبدأ IV)؛ الحذف الناعم (UPDATE deleted_at) يُسجَّل؛ UPDATE وDELETE على audit_log يفشلان حتى بدور admin؛ INSERT مباشر من مستخدم يفشل. يفشل.
- [ ] T027 [US3] تنفيذ `supabase/migrations/0012_audit.sql` (audit_log + `audit_trigger()` SECURITY DEFINER بـ to_jsonb(OLD/NEW) AFTER INSERT/UPDATE/DELETE على **كل الجداول القابلة للتعديل بما فيها `profiles` (تغيير الأدوار) و`sources` (الاعتماد)** إضافةً لجداول المحتوى/الترجمة/الربط/الملاحظات؛ RLS audit_log: لا UPDATE/DELETE/INSERT مباشر، SELECT للأدوار المخوّلة فقط) → أخضر → commit. **[blockedBy T026, T025]** — (FR-026..030, SC-002/003؛ مبدأ IV)

**Checkpoint:** تدقيق شامل غير قابل للعبث.

---

## Phase 7: US7 — خطّاف الإشعارات (P3) — outbox

- [ ] T028 [US7] اختبار `supabase/tests/08_outbox.sql` (أحمر): حدث مهم (مثل نشر/رفع للمراجعة/اعتماد مرجع) يُنتج صفًا في notification_outbox بـ event_type وpayload. يفشل.
- [ ] T029 [US7] تنفيذ `supabase/migrations/0013_outbox.sql` (notification_outbox + trigger من audit_log للأحداث المهمة؛ لا تسليم فعلي) → أخضر → commit. **[blockedBy T028, T027]** — (FR-036؛ لبنة ٢٦)

**Checkpoint:** خطّاف الإشعارات يلتقط؛ التسليم لاحقًا.

---

## Phase 8: US1/US6 — RLS (الأمان والرؤية)

> **هدف القصة:** anon يرى المنشور فقط؛ أقل-امتياز؛ الكتابة تتطلب 2FA (aal2). **اختبار مستقل:** anon لا يرى المسودات؛ author لا ينشر.

- [ ] T030 [US6] اختبار `supabase/tests/07_rls.sql` (أحمر): anon يرى events المنشورة فقط ولا يكتب (42501)؛ دور تحريري يرى المسودات؛ author لا يصنع `approved→published`؛ الكتابة/المراجعة/الإدارة تتطلب `aal2` (aal1 يُرفض)؛ المصدر غير approved لا يُستشهد به. يفشل.
- [ ] T031 [US6] تنفيذ `supabase/migrations/0014_rls.sql` (تفعيل RLS على كل الجداول + سياسات: قراءة عامة=published، قراءة كاملة للأدوار، كتابة بأقل-امتياز، انتقال بالدور، اشتراط aal2 للكتابة/المراجعة/الإدارة، حماية sources غير approved) → أخضر → commit. **[blockedBy T030, T027, T009]** — (FR-024/032/033/034/042, SC-006؛ مبادئ III/VIII)

**Checkpoint:** الوصول مؤمَّن، الرؤية مضبوطة، 2FA جاهز.

---

## Phase 9: Polish & النشر السحابي وحفظ البيانات

- [ ] T032 [P] تشغيل كامل الاختبارات `supabase db reset && supabase test db` (كل `01`–`08` خضراء) + تحقّق تغطية SC-001..011 (جدول تتبّع في تعليق). commit أي إصلاحات.
- [ ] T033 بذرة المصادر المرشّحة `supabase/seed.sql` (القرآن approved؛ البخاري/مسلم/الدرر/ابن هشام/الرحيق/العمري/زاد المعاد = proposed) + تحقّق العدد. commit. — (لبنة ١٧)
- [ ] T034 **[يعتمد على المالك]** ربط ودفع السحابي: `supabase login` (الحساب الثاني) + `supabase link --project-ref <REF>` + `supabase db push`. **لا يُنفَّذ إلا بعد موافقة المالك + تزويده login/project-ref؛ السحابي لا يُصفَّر.** — (FR-038, SC-011) **[blockedBy T032]**
- [ ] T035 [P] نسخة احتياطية أولى `scripts/db-dump.sh` + `README.md` (أوامر م٠ + ملاحظة بوابة المراجعة) + توثيق مهمة تصدير NAS الأسبوعية. commit. — (FR-037؛ لبنة ٤٣)

---

## Dependencies (ملخص)

- **Setup (T001-T003)** يحجب كل ما بعده.
- **Foundational (T004-T009)** يحجب كل أطوار القصص.
- كل **impl** `blockedBy` اختباره المقابل (بوابة TDD).
- ترتيب الترحيلات خطّي بالاعتماد المرجعي: 0001→0002→0003→0004→0005→0006→0007→0008/0009/0010→0011→0012→0013→0014.
- **T034 (دفع سحابي)** `blockedBy` T032 + **موافقة المالك + login/project-ref**.

## فرص التوازي (محدودة — اعتماد مرجعي خطّي)

- T003 (helpers) ‖ T001/T002 جزئيًا.
- داخل Phase 4 بعد T013: T018/T019 (join) ‖ T020/T021 (notes) مستقلّان عن مسار الترجمة T014/T015 (لكن claims T016/T017 يعتمد على الاثنين).
- T032/T035 [P] في الطور الأخير.
- غالب العمل **متسلسل** لأن الجداول تتسلسل مرجعيًا — وهذا مقصود.

## MVP المقترح

**US1 + US2 + US3** (بوابة المراجعة + التوثيق + التدقيق) = نواة المصداقية. عمليًا: Phases 1–6 (T001–T027) تثبت المنهج؛ ثم US4/US5/US6/US7 تكمّل.

## استراتيجية التنفيذ

1. تسلسل صارم بترتيب الترحيلات (الاعتماد المرجعي يفرضه).
2. لكل وحدة: أحمر → أخضر → commit (قرار ٢٠).
3. لا دفع سحابي قبل خضرة الكل + موافقة المالك.
4. بعد كل طور: checkpoint يثبت أن القصة قابلة للاختبار باستقلال.

## تتبّع التغطية (US → tasks)

| US | المهام |
|----|--------|
| US1 بوابة المراجعة | T018/T019/T024/T025 (+RLS T030/T031) |
| US2 التوثيق | T010/T011/T016/T017/T033 |
| US3 التدقيق | T026/T027 |
| US4 اللغات | T004–T007/T014/T015 |
| US5 السلامة/الحذف الناعم/body_plain | T012/T013/T016/T017/T022/T023 |
| US6 الأدوار/2FA | T008/T009/T030/T031 |
| US7 الملاحظات/الخطّاف | T020/T021/T028/T029 |
| US8 الترتيب الزمني | T012/T013 (timeline_order/approx_year_signed) |
