# Phase 1 — Data Model: م٠ نواة قاعدة البيانات

> وصفٌ تفصيلي للمخطط (جداول/أعمدة/قيود/علاقات) كافٍ للتنفيذ. الـ DDL الفعلي يُكتب في طور implement (ملفات migration)، بعد اختبار pgTAP فاشل لكل عنصر. كل الإشارات للقوائم الثابتة عبر `code`.

## 0) اصطلاحات عامة

**أعمدة قياسية على كل جداول الكيانات/الترجمة/الربط/الملاحظات:**
- `id uuid primary key default gen_random_uuid()` (عدا جداول الترجمة والمرجعية — انظر مفاتيحها).
- `created_at timestamptz not null default now()` · `updated_at timestamptz not null default now()` — يُحدَّث بدالة مشتركة `set_updated_at()` (تُنشأ في 0003) تُربط كـ trigger BEFORE UPDATE بكل جدول له `updated_at`.
- `created_by uuid references public.profiles(id)`.
- `deleted_at timestamptz` (NULL = حيّ) — **حذف ناعم؛ لا DELETE فيزيائي في المسار العادي**.

**التفرّد الجزئي (مبدأ VI):** كل تفرّد منطقي = `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`.

**العروض الافتراضية:** تستثني `deleted_at IS NOT NULL` (تُطبَّق في طبقة الاستعلام/RLS أو views لاحقًا).

---

## 1) الجداول المرجعية (Lookups) — code-keyed + تسميات مترجَمة

نمط موحّد لكل قائمة `X`:
```
public.X (
  code        text primary key,
  color       text,            -- اختياري، للعرض (لبنة ٢١)
  sort_order  int not null default 0,
  is_active   boolean not null default true
)
public.X_labels (
  code  text not null references public.X(code),
  lang  text not null references public.languages(code),
  label text not null,
  primary key (code, lang)
)
```

| الجدول | الأكواد (بذرة) | حقول خاصة |
|--------|----------------|-----------|
| `languages` | `ar` (نشط؛ أصل) — لغات أخرى تُضاف لاحقًا | `is_source boolean` (ar=true) · `direction text` (rtl/ltr) |
| `roles` | `author` · `shariah_reviewer` · `editor` · `admin` | `rank int` (للترتيب الهرمي) |
| `review_states` | `draft` · `submitted` · `shariah_approved` · `approved` · `published` · `needs_revision` · `rejected` | `is_public_visible boolean` (published=true) |
| `doc_grades` | `quranic` · `sahih_hadith` · `hasan_hadith` · `authentic_athar` · `sirah_accepted` · `historically_famous` · `disputed` · `weak` · `unverified` · `rejected` | `requires_grading_source boolean` (sahih/hasan/athar=true) · `is_publishable boolean` |
| `confidence_levels` | `confirmed` · `likely` · `approximate` · `disputed` · `unknown` | — |
| `claim_types` | `event_origin` · `date` · `place` · `number` · `participant` · `name` · `lineage` · `conversion` · `death` · `position` · `relationship` · `quote` · `lesson` | `uses_confidence boolean` (date/place=true) |
| `citation_relations` | `primary` · `supporting` · `alternative` · `disputed` · `weak` | — |
| `source_types` | `quran` · `hadith` · `sirah` · `tafsir` · `history` · `biography` · `grading_reference` · `other` | — |
| `source_statuses` | `proposed` · `approved` · `rejected` | — |
| `note_types` | `classification_reason` · `scholarly_dispute` · `editorial_note` · `reviewer_note` · `rejection_reason` | — |

> التسميات العربية تُبذَر في `*_labels` بلغة `ar` (FR-003/041). قواعد العمل وآلة الحالات وRLS تشير إلى `code` لا `label`.

---

## 2) profiles (المستخدمون والأدوار)

```
profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  role_code text not null default 'author' references public.roles(code),
  created_at, updated_at, deleted_at
)
```
- دالة `public.current_role_name() returns text` (SECURITY DEFINER، تقرأ role_code لـ auth.uid()). **ملاحظة: لا تُسمَّ `current_role` — كلمة محجوزة في Postgres.**
- trigger `on_auth_user_created` يُنشئ profile تلقائيًا عند إضافة مستخدم.
- **2FA:** لا عمود boolean؛ الفرض عبر RLS (`auth.jwt()->>'aal'='aal2'`) — D12.

---

## 3) sources · citations (التوثيق)

```
sources (
  id, slug text, title text not null, author text,
  source_type_code text not null references source_types(code),
  status_code text not null default 'proposed' references source_statuses(code),
  reliability text, publisher, edition, url, notes, approval_note,
  created_by, created_at, updated_at, deleted_at
)
-- partial unique: (slug) WHERE deleted_at IS NULL
```
```
citations (
  id, source_id uuid not null references sources(id) on delete restrict,
  reference_text text, volume text, page_number text, hadith_number text,
  url text, quote text,
  grading text,            -- نص الحكم المنقول (مثل "صحيح")
  grading_source text,     -- الجهة المسمّاة التي أصدرته
  created_by, created_at, updated_at, deleted_at,
  constraint citation_grading_needs_source
    check (grading is null or (grading_source is not null and btrim(grading_source) <> ''))
)
```
- **مبدأ I (D5):** لا حكم بلا جهة مسمّاة، مفروض بـ CHECK.
- **اعتماد المصدر (لبنة ١٧):** الاستشهاد بمصدر `status_code <> 'approved'` يُمنع/يُعلَّم — يُفرض في RLS/trigger ويُختبر.

---

## 4) كيانات المحتوى (طبقة الهيكل — لا نصّ مترجَم هنا)

> الحقول النصّية المعروضة (عنوان/سرد) تعيش في جداول الترجمة. الهيكل يحمل ما لا يتغيّر باللغة + `review_status` (= المراجعة الشرعية، D6).

```
locations (
  id, location_type text,
  latitude double precision, longitude double precision,
  geo_confidence_code text not null default 'unknown' references confidence_levels(code),
  review_status_code text not null default 'draft' references review_states(code),
  created_by, created_at, updated_at, deleted_at
)
```
```
events (
  id,
  timeline_order integer not null,          -- الترتيب الحقيقي اليدوي (FR-017)
  approx_year_signed integer,               -- سنة موقّعة: - قبل الهجرة / + بعدها (FR-018)
  phase text, event_type text,
  date_confidence_code text not null default 'unknown' references confidence_levels(code),
  primary_location_id uuid references locations(id),
  review_status_code text not null default 'draft' references review_states(code),
  created_by, created_at, updated_at, deleted_at
)
-- index على (timeline_order), (review_status_code)
```
```
persons (
  id,
  full_name text, kunya text, title text,   -- حقول تمييز تشابه الأسماء (لبنة ٣٩)
  person_type text,
  birth_text text, death_text text,
  review_status_code text not null default 'draft' references review_states(code),
  created_by, created_at, updated_at, deleted_at
)
```
> النبي ﷺ = صف `persons` عادي (FR-002). الاسم/النسب القابل للترجمة في `person_translations`؛ حقول التمييز البنيوية هنا.

---

## 5) جداول الترجمة (طبقة النصوص — لكل لغة)

نمط موحّد (FR-005/006/008، D2):
```
<entity>_translations (
  id uuid primary key default gen_random_uuid(),
  <entity>_id uuid not null references <entity>(id) on delete cascade,
  lang text not null references languages(code),
  title text, summary text,
  body jsonb not null default '{}'::jsonb,   -- نص غني + علامات إشارة inline لـ claims (FR-040, D3)
  body_plain text,                           -- مشتق تلقائيًا (D9)
  slug text,                                 -- slug لكل لغة (لبنة ١٤/٢٩)
  review_status_code text not null default 'draft' references review_states(code),  -- المراجعة التحريرية (D6)
  created_by, created_at, updated_at, deleted_at,
  unique-partial (<entity>_id, lang) WHERE deleted_at IS NULL,
  unique-partial (lang, slug) WHERE deleted_at IS NULL
)
```
- الكيانات: `event_translations` · `person_translations` · `location_translations` · `claim_translations`.
- `claim_translations.body` يحمل نص المعلومة المترجَم؛ والإشارات `[n]` المشتقة تأتي من ظهور `claim_id` داخل `*_translations.body` للكيان الحاوي.

**قاعدة الظهور بلغة L (D6):** `structure.review_status_code='published' AND translation[L].review_status_code='published'`؛ وإلا رجوع لـ `ar` مع إشارة (منطق عرض، م٦؛ البيانات جاهزة الآن).

---

## 6) claims · claim_citations (المعلومة المفردة)

```
claims (
  id,
  event_id uuid references events(id),
  person_id uuid references persons(id),
  location_id uuid references locations(id),
  constraint one_container check (num_nonnulls(event_id, person_id, location_id) = 1),  -- FR-009, D4
  claim_type_code text not null references claim_types(code),
  doc_grade_code text not null default 'unverified' references doc_grades(code),
  date_confidence_code text references confidence_levels(code),  -- لأنواع date/place فقط
  display_order integer not null default 0,                      -- ترتيب الظهور (مصدر اشتقاق [n])
  review_status_code text not null default 'draft' references review_states(code),  -- المراجعة الشرعية
  created_by, created_at, updated_at, deleted_at
)
-- index على (event_id),(person_id),(location_id),(review_status_code)
```
> نص المعلومة المترجَم في `claim_translations` (D2/D3) — لا نصّ في الهيكل.

```
claim_citations (
  id, claim_id uuid not null references claims(id) on delete cascade,
  citation_id uuid not null references citations(id) on delete restrict,
  relation_code text not null default 'primary' references citation_relations(code),
  notes text, created_at, deleted_at,
  unique-partial (claim_id, citation_id) WHERE deleted_at IS NULL
)
```

**قيد "لا معلومة بلا مصدر" (FR-010):** يُفرض بـ trigger/اختبار — claim عند بلوغه `submitted` فأعلى يجب أن يملك ≥١ `claim_citation` حيّ.

**قيد "حكم⇐مصدر حكم" على المعلومة (FR-012, D5):** claim بـ `doc_grade_code` حيث `doc_grades.requires_grading_source = true` يجب أن يملك claim_citation→citation بـ `grading_source` غير فارغ. يُفرض بـ trigger + اختبار.

---

## 7) جداول الربط

```
event_persons (
  id, event_id uuid not null references events(id) on delete cascade,
  person_id uuid not null references persons(id) on delete cascade,
  role text, participation_evidence text,   -- explicit/group_based/disputed/possible/unknown
  citation_id uuid references citations(id),
  notes text, created_at, deleted_at,
  unique-partial (event_id, person_id, role) WHERE deleted_at IS NULL
)
event_locations (
  id, event_id uuid not null references events(id) on delete cascade,
  location_id uuid not null references locations(id) on delete cascade,
  role text, order_index integer not null default 0,
  notes text, created_at, deleted_at
)
```
> قاعدة عرض الأشخاص (لبنة ٢٧: غياب حدث ≠ نفي) سياسة عرض م٦، لا قيد بيانات.

---

## 8) content_notes (الملاحظات الداخلية)

```
content_notes (
  id,
  -- أعمدة حاوية منفصلة + قيد واحد فقط (كنمط claims)
  event_id uuid references events(id), person_id uuid references persons(id),
  location_id uuid references locations(id), source_id uuid references sources(id),
  constraint note_one_container check (num_nonnulls(event_id,person_id,location_id,source_id) = 1),
  note_type_code text not null references note_types(code),
  body text not null,
  is_public boolean not null default false,   -- مخفية عن الزائر افتراضيًا (FR-035)
  created_by, created_at, updated_at, deleted_at
)
```

---

## 9) audit_log (تدقيق شامل append-only — D10)

```
audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text,                 -- معرّف الصف (uuid/identity كنص)
  op text not null,            -- INSERT/UPDATE/DELETE/LOGIN/LOGOUT
  old_data jsonb, new_data jsonb,
  actor uuid,                  -- auth.uid()
  actor_role text,             -- current_role_name() وقت الفعل
  occurred_at timestamptz not null default now()
)
```
- دالة `audit_trigger()` **SECURITY DEFINER**: تستخدم `to_jsonb(OLD)`/`to_jsonb(NEW)`؛ AFTER INSERT/UPDATE/DELETE على **كل الجداول القابلة للتعديل** — يشمل صراحةً: events/persons/locations/`*_translations`/claims/claim_citations/event_persons/event_locations/content_notes/sources/citations **و`profiles` (تغيير الأدوار) و`sources.status` (اعتماد المصدر)** — لأن مبدأ IV = كل أفعال الإداريين، وتغيير الدور/اعتماد المصدر من أكثرها حساسية. (يشمل UPDATE للحذف الناعم → يُسجَّل كحذف منطقي.)
- دخول/خروج الإداريين: عبر Supabase Auth Hook → INSERT صف `op='LOGIN'/'LOGOUT'` (R-b: إن تعذّر مبكرًا يُوثَّق لا يُدّعى).
- **append-only:** RLS تمنع UPDATE/DELETE للجميع (بما فيه admin) وتمنع INSERT المباشر من المستخدم؛ الكتابة فقط عبر الدالة المالكة. SELECT مقصور على الأدوار المخوّلة.

---

## 10) notification_outbox (خطّاف الإشعارات — D11)

```
notification_outbox (
  id bigint generated always as identity primary key,
  event_type text not null,    -- admin_login / content_submitted / approved / published / rejected / source_approved ...
  payload jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz     -- يملؤه المستهلك لاحقًا (تيليجرام)
)
```
- trigger من `audit_log` (أو من نفس دالة التدقيق) يُدرج صفًا للأحداث المهمة. **لا تسليم فعلي في م٠** (لبنة ٢٦).
- تصدير NAS: سكربت `scripts/db-dump.sh` + توثيق مهمة أسبوعية (لبنة ٤٣) — لا pg_cron الآن.

---

## 11) آلة حالات المراجعة

```
review_transitions (                       -- مدرك للطبقة (D6/D7، س٥)
  layer     text not null,                  -- 'structure' | 'translation'
  from_code text not null references review_states(code),
  to_code   text not null references review_states(code),
  role_code text not null references roles(code),
  primary key (layer, from_code, to_code)
)
```
- الطبقتان وانتقالاتهما + الدور + الشرط بين الطبقتين + قاعدة الظهور: في [contracts/state-machine.md](./contracts/state-machine.md).
- `enforce_review_transition()` trigger BEFORE UPDATE يتلقّى `layer` عبر TG_ARGV: `'structure'` على events/persons/locations/claims، و`'translation'` على `*_translations` — يفرض جدول الطبقة للجميع + الدور (مقارنة OLD→NEW) + شرط "الترجمة لا تبلغ `published` إلا والهيكل الأب `published`" (D7).
- **الهيكل** يأخذ السلسلة الكاملة (شرعي→تحريري→نشر) وينتهي عند `published`؛ **الترجمة** تحريري→نشر فقط (لا مراجعة شرعية؛ استثناء المقدّس عبر `needs_revision`). **الظهور(L)** = الهيكل published AND ترجمة L published.

---

## 12) تتبّع المتطلبات → عنصر المخطط (Traceability)

| FR | عنصر المخطط |
|----|-------------|
| FR-001/002/003 | جداول الهيكل + قوائم مرجعية + persons يشمل النبي ﷺ |
| FR-004..008 | طبقة هيكل + `*_translations` (entity_id, lang) + review_status للترجمة |
| FR-009 | `claims` CHECK num_nonnulls=1 |
| FR-010 | trigger "claim≥1 citation عند submitted+" |
| FR-011 | `claims.doc_grade_code` NOT NULL |
| FR-012 | `citation_grading_needs_source` + trigger requires_grading_source |
| FR-013 | `claim_citations.relation_code` |
| FR-014 | `sources.status_code` + منع الاستشهاد بغير approved |
| FR-015 | `body_plain` + trigger اشتقاق (D9) |
| FR-016 | `citations` volume/page/hadith_number |
| FR-017/018 | `events.timeline_order` / `approx_year_signed` |
| FR-019/020 | `deleted_at` + partial unique + استثناء العرض |
| FR-021..025 | `review_transitions` + `enforce_review_transition` + RLS بالدور + R2 (actor مسجّل) |
| FR-026..030 | `audit_log` + `audit_trigger` + RLS append-only |
| FR-031..034 | `profiles.role_code` + RLS أقل-امتياز + aal2 |
| FR-035 | `content_notes.is_public` |
| FR-036 | `notification_outbox` + trigger |
| FR-037 | `scripts/db-dump.sh` + توثيق NAS |
| FR-038 | كل تغيير عبر migration (لا عنصر مخطط — قاعدة سير) |
| FR-039 | بوابة TDD في tasks |
| FR-040 | `*_translations.body jsonb` + claims مشترك + ترقيم مشتق |
| FR-041 | الجداول المرجعية + `*_labels` |
| FR-042 | سياسات RLS aal2 + شرط بوابة موثّق |
