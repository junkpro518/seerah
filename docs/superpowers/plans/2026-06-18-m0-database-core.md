# خطة تنفيذ م٠ — نواة قاعدة البيانات والأدوار وبوابة المراجعة

> ⚠️ **هذه الخطة قديمة — تحتاج إعادة بناء قبل التنفيذ.**
> كُتبت قبل قرارات ٢٤–٣٢ التي غيّرت مخطط م٠ جذريًا. يجب إعادة توليدها من `docs/CONCEPT.md` لتشمل:
> - **تعدد اللغات** (لبنة ٢٩): طبقة هيكل + جداول نصوص لكل لغة — يغيّر بنية events/persons/locations/claims.
> - **سجل تدقيق شامل** (لبنة ٢٥): `audit_log` + trigger عام + أحداث المصادقة.
> - **الملاحظات الداخلية** `content_notes` (لبنة ٢٤).
> - **خطّاف إشعارات تيليجرام** (لبنة ٢٦).
> - بيئة سحابية مباشرة على حساب Supabase ثانٍ (لا Docker محلي) — لبنة ٢٠.
> **ما تحته صالح كمرجع للأنماط (enums، RLS، آلة الحالات) لكن ليس للتنفيذ الحرفي.**

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** بناء نواة قاعدة بيانات Supabase (مخطط + أدوار + بوابة مراجعة إلزامية عبر RLS) للموسوعة، مُختبَرة بـ pgTAP، محليًا قبل أي ربط سحابي.

**Architecture:** قاعدة Postgres عبر Supabase CLI محليًا (Docker). كل تغيير = migration في Git. كل لافتة (enum) وجدول وسياسة RLS تُختبر بـ pgTAP عبر `supabase test db`. بوابة المراجعة = آلة حالات مفروضة بـ trigger على الجميع (حتى المدير) + سياسات RLS لتحديد مَن يصنع أي انتقال. القراءة العامة (anon) مقصورة على `review_status = 'published'`.

**Tech Stack:** Supabase CLI 2.75, PostgreSQL 15, pgTAP, Git. (لا واجهة Next.js في م٠ — تأتي في م١.)

**نطاق م٠ فقط:** المخطط + الأدوار + بوابة المراجعة + بذرة المصادر + نسخ احتياطي يدوي. أداة الإدخال (م١) والموقع العام (م٣+) خارج هذه الخطة.

**مرجع القرارات:** `docs/CONCEPT.md` (اللبنات ٩–١٩).

---

## بنية الملفات

```
/ (جذر المشروع)
├── .gitignore
├── README.md                                  # نظرة عامة + أوامر م٠
├── docs/
│   ├── CONCEPT.md                             # موجود
│   └── superpowers/plans/…                    # هذه الخطة
└── supabase/
    ├── config.toml                            # يولّده supabase init
    ├── migrations/
    │   ├── 0001_enums.sql                     # اللافتات (enums)
    │   ├── 0002_profiles.sql                  # المستخدمون والأدوار + دالة role()
    │   ├── 0003_sources_citations.sql         # المصادر والاستشهادات + CHECK حكم/مصدر-حكم
    │   ├── 0004_content_entities.sql          # events / persons / locations
    │   ├── 0005_claims.sql                    # claims + claim_citations
    │   ├── 0006_join_tables.sql               # event_persons / event_locations
    │   ├── 0007_review_state_machine.sql      # trigger الانتقالات المسموحة
    │   └── 0008_rls_policies.sql              # تفعيل RLS + كل السياسات
    ├── seed.sql                               # بذرة المصادر المرشّحة + أدوار اختبار
    └── tests/
        ├── 00_helpers.sql                     # دوال مساعدة للاختبار (انتحال مستخدم/دور)
        ├── 01_schema.sql                      # وجود الجداول واللافتات
        ├── 02_constraints.sql                 # CHECK: لا حكم بلا مصدر حكم
        ├── 03_state_machine.sql               # منع القفز (حتى للمدير)
        └── 04_rls.sql                         # رؤية anon + صلاحيات الأدوار
```

**مبدأ التصميم:** ملف migration واحد لكل مسؤولية؛ الاختبارات مفصولة عن المخطط؛ الانتقالات في trigger واحد مركزي بدل تكرارها في كل سياسة.

---

## نموذج بوابة المراجعة (مرجع لكل المهام)

`review_status` المسموح وانتقالاته (تُفرض في `0007`):

```
draft ──(author)──▶ submitted
submitted ──(shariah_reviewer)──▶ shariah_approved | needs_revision | rejected
shariah_approved ──(editor)──▶ approved | needs_revision | rejected
approved ──(admin)──▶ published | needs_revision
published ──(admin)──▶ approved        # سحب النشر
needs_revision ──(author)──▶ submitted
```

أي انتقال خارج هذا الجدول يُرفض بـ exception **للجميع بمن فيهم المدير** (لا قفز من draft إلى published).

الأدوار: `author` · `shariah_reviewer` · `editor` · `admin`.

---

## Task 0: تهيئة المشروع و Supabase محليًا

**Files:**
- Create: `.gitignore`
- Create: `supabase/config.toml` (يولّده الأمر)

- [ ] **Step 1: تأكد أن Docker يعمل**

Run: `docker info >/dev/null 2>&1 && echo OK || open -a Docker`
ثم انتظر حتى: `docker info >/dev/null 2>&1 && echo READY` يطبع `READY` (افتح Docker Desktop يدويًا إن لزم).

- [ ] **Step 2: تهيئة Git و Supabase**

```bash
cd /Users/mohammedaljohani/Documents/Proj/0
git init
supabase init    # عند السؤال عن إعدادات VS Code/Deno: اقبل الافتراضي (n كافٍ)
```

- [ ] **Step 3: أنشئ `.gitignore`**

```gitignore
# Supabase
supabase/.branches
supabase/.temp
.env
.env.*

# macOS
.DS_Store

# Node (لاحقًا في م١)
node_modules/
```

- [ ] **Step 4: شغّل المكدّس المحلي وفعّل pgTAP**

```bash
supabase start
```
Expected: يطبع `API URL`, `DB URL`, `anon key`. (أول مرة تأخذ دقائق لتنزيل الصور.)

- [ ] **Step 5: أنشئ migration فارغ يفعّل pgTAP للاختبارات**

```bash
supabase migration new enable_pgtap
```
ثم اكتب في الملف المُنشأ تحت `supabase/migrations/`:

```sql
create extension if not exists pgtap with schema extensions;
```

- [ ] **Step 6: طبّق وتحقّق**

Run: `supabase db reset`
Expected: ينجح بدون أخطاء، ويطبّق الـ migrations بالترتيب.

- [ ] **Step 7: Commit**

```bash
git add .gitignore supabase/
git commit -m "chore: init supabase local project + pgtap"
```

---

## Task 1: اللافتات (enums)

**Files:**
- Create: `supabase/migrations/0001_enums.sql`
- Test: `supabase/tests/01_schema.sql`

- [ ] **Step 1: اكتب اختبار وجود اللافتات (سيفشل)**

أنشئ `supabase/tests/01_schema.sql`:

```sql
begin;
select plan(8);

select has_type('public', 'user_role', 'enum user_role موجود');
select has_type('public', 'review_status', 'enum review_status موجود');
select has_type('public', 'verification_level', 'enum verification_level موجود');
select has_type('public', 'confidence_level', 'enum confidence_level موجود');
select has_type('public', 'claim_type', 'enum claim_type موجود');
select has_type('public', 'citation_relation', 'enum citation_relation موجود');
select has_type('public', 'source_type', 'enum source_type موجود');
select has_type('public', 'source_status', 'enum source_status موجود');

select * from finish();
rollback;
```

- [ ] **Step 2: شغّل الاختبار وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل — اللافتات غير موجودة.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0001_enums.sql`:

```sql
create type public.user_role as enum
  ('author','shariah_reviewer','editor','admin');

create type public.review_status as enum
  ('draft','submitted','shariah_approved','approved','published','needs_revision','rejected');

create type public.verification_level as enum
  ('quranic','sahih_hadith','hasan_hadith','authentic_athar','sirah_accepted',
   'historically_famous','disputed','weak','unverified','rejected');

create type public.confidence_level as enum
  ('confirmed','likely','approximate','disputed','unknown');

create type public.claim_type as enum
  ('event_origin','date','place','number','participant','name','lineage',
   'conversion','death','position','relationship','quote','lesson');

create type public.citation_relation as enum
  ('primary','supporting','alternative','disputed','weak');

create type public.source_type as enum
  ('quran','hadith','sirah','tafsir','history','biography','grading_reference','other');

create type public.source_reliability as enum
  ('primary','high','medium','supporting');

create type public.source_status as enum
  ('proposed','approved','rejected');
```

- [ ] **Step 4: طبّق وشغّل الاختبار**

Run: `supabase db reset && supabase test db`
Expected: نجاح الاختبارات الثمانية.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_enums.sql supabase/tests/01_schema.sql
git commit -m "feat(db): add enum types for content, verification, roles"
```

---

## Task 2: المستخدمون والأدوار (profiles)

**Files:**
- Create: `supabase/migrations/0002_profiles.sql`
- Modify: `supabase/tests/01_schema.sql` (إضافة فحص الجدول)

- [ ] **Step 1: أضف اختبار وجود الجدول والدالة**

في `supabase/tests/01_schema.sql` غيّر `plan(8)` إلى `plan(10)` وأضف قبل `finish()`:

```sql
select has_table('public', 'profiles', 'جدول profiles موجود');
select has_function('public', 'current_role_name', 'دالة current_role_name موجودة');
```

- [ ] **Step 2: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل الفحصين الجديدين.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0002_profiles.sql`:

```sql
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  role public.user_role not null default 'author',
  created_at timestamptz not null default now()
);

-- دالة تُرجع دور المستخدم الحالي (security definer لتجاوز RLS على profiles)
create or replace function public.current_role_name()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

-- إنشاء profile تلقائيًا عند تسجيل مستخدم جديد
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', ''));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: طبّق وشغّل**

Run: `supabase db reset && supabase test db`
Expected: نجاح كل فحوص `01_schema.sql` (١٠).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0002_profiles.sql supabase/tests/01_schema.sql
git commit -m "feat(db): add profiles table, role helper, auto-profile trigger"
```

---

## Task 3: المصادر والاستشهادات + قاعدة "لا حكم بلا مصدر حكم"

**Files:**
- Create: `supabase/migrations/0003_sources_citations.sql`
- Create: `supabase/tests/02_constraints.sql`

- [ ] **Step 1: اكتب اختبار قاعدة الحكم (سيفشل)**

أنشئ `supabase/tests/02_constraints.sql`:

```sql
begin;
select plan(2);

-- تجهيز مصدر
insert into public.sources (id, slug, title, source_type)
values ('00000000-0000-0000-0000-000000000001', 'sahih-bukhari', 'صحيح البخاري', 'hadith');

-- (1) استشهاد بحكم وبدون مصدر حكم → يجب أن يُرفض
select throws_ok(
  $$ insert into public.citations (source_id, reference_text, grading)
     values ('00000000-0000-0000-0000-000000000001', 'كتاب بدء الوحي', 'صحيح') $$,
  '23514',  -- check_violation
  null,
  'يُرفض حكم بلا مصدر حكم'
);

-- (2) استشهاد بحكم ومصدر حكم → يُقبل
select lives_ok(
  $$ insert into public.citations (source_id, reference_text, grading, grading_source)
     values ('00000000-0000-0000-0000-000000000001', 'كتاب بدء الوحي', 'صحيح', 'متفق عليه') $$,
  'يُقبل حكم مع مصدر حكم'
);

select * from finish();
rollback;
```

- [ ] **Step 2: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل — جدولا sources/citations غير موجودين.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0003_sources_citations.sql`:

```sql
create table public.sources (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  author text,
  source_type public.source_type not null,
  reliability public.source_reliability,
  publisher text,
  edition text,
  url text,
  notes text,
  status public.source_status not null default 'proposed',
  approval_note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.citations (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources (id) on delete restrict,
  reference_text text,
  volume text,
  page_number text,
  hadith_number text,
  url text,
  quote text,
  grading text,            -- نص الحكم المنقول، مثل "صحيح"
  grading_source text,     -- الجهة التي أصدرت الحكم
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- "ننقل فقط": لا حكم بلا تسمية الجهة التي أصدرته
  constraint citation_grading_needs_source
    check (grading is null or grading_source is not null)
);

create index on public.citations (source_id);
```

- [ ] **Step 4: طبّق وشغّل**

Run: `supabase db reset && supabase test db`
Expected: نجاح فحصي `02_constraints.sql`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_sources_citations.sql supabase/tests/02_constraints.sql
git commit -m "feat(db): add sources & citations with grading-source constraint"
```

---

## Task 4: كيانات المحتوى (events / persons / locations)

**Files:**
- Create: `supabase/migrations/0004_content_entities.sql`
- Modify: `supabase/tests/01_schema.sql`

- [ ] **Step 1: أضف فحوص الجداول**

في `supabase/tests/01_schema.sql` غيّر `plan(10)` إلى `plan(13)` وأضف:

```sql
select has_table('public', 'events', 'جدول events موجود');
select has_table('public', 'persons', 'جدول persons موجود');
select has_table('public', 'locations', 'جدول locations موجود');
```

- [ ] **Step 2: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل الفحوص الثلاثة الجديدة.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0004_content_entities.sql`:

```sql
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text,
  location_type text,
  latitude double precision,
  longitude double precision,
  geo_confidence public.confidence_level not null default 'unknown',
  review_status public.review_status not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null,
  summary text,
  body jsonb not null default '{}'::jsonb,   -- محتوى غني (rich JSON) لمحرّر م١
  phase text,
  event_type text,
  hijri_date_text text,
  gregorian_date_text text,
  date_confidence public.confidence_level not null default 'unknown',
  primary_location_id uuid references public.locations (id),
  review_status public.review_status not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  kunya text,
  title text,
  full_name text,
  short_bio text,
  biography jsonb not null default '{}'::jsonb,
  person_type text,
  birth_text text,
  death_text text,
  review_status public.review_status not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.events (review_status);
create index on public.persons (review_status);
create index on public.locations (review_status);
```

- [ ] **Step 4: طبّق وشغّل**

Run: `supabase db reset && supabase test db`
Expected: نجاح كل `01_schema.sql` (١٣).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_content_entities.sql supabase/tests/01_schema.sql
git commit -m "feat(db): add events, persons, locations content tables"
```

---

## Task 5: المعلومة المفردة (claims) والربط بالاستشهادات

**Files:**
- Create: `supabase/migrations/0005_claims.sql`
- Modify: `supabase/tests/02_constraints.sql`

- [ ] **Step 1: أضف اختبار قيد الحاوية**

في `supabase/tests/02_constraints.sql` غيّر `plan(2)` إلى `plan(3)` وأضف قبل `finish()`:

```sql
-- claim بنوع حاوية غير صالح → يُرفض
select throws_ok(
  $$ insert into public.claims (container_type, container_id, claim_text, claim_type, verification_level)
     values ('foo', '00000000-0000-0000-0000-000000000099', 'نص', 'number', 'sahih_hadith') $$,
  '23514',
  null,
  'يُرفض claim بنوع حاوية غير صالح'
);
```

- [ ] **Step 2: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل — جدول claims غير موجود.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0005_claims.sql`:

```sql
create table public.claims (
  id uuid primary key default gen_random_uuid(),
  container_type text not null check (container_type in ('event','person','location')),
  container_id uuid not null,                 -- مرجع متعدّد الأشكال (يُفرض تطبيقيًا/بـ trigger لاحقًا)
  claim_text text not null,
  claim_type public.claim_type not null,
  verification_level public.verification_level not null default 'unverified',
  date_confidence public.confidence_level,    -- يُستخدم فقط مع النوع date/place
  note text,
  display_order integer not null default 0,
  review_status public.review_status not null default 'draft',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.claims (container_type, container_id);

create table public.claim_citations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims (id) on delete cascade,
  citation_id uuid not null references public.citations (id) on delete restrict,
  relation public.citation_relation not null default 'primary',
  notes text,
  unique (claim_id, citation_id)
);

create index on public.claim_citations (claim_id);
```

- [ ] **Step 4: طبّق وشغّل**

Run: `supabase db reset && supabase test db`
Expected: نجاح كل `02_constraints.sql` (٣).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0005_claims.sql supabase/tests/02_constraints.sql
git commit -m "feat(db): add claims and claim_citations"
```

---

## Task 6: جداول الربط (event_persons / event_locations)

**Files:**
- Create: `supabase/migrations/0006_join_tables.sql`
- Modify: `supabase/tests/01_schema.sql`

- [ ] **Step 1: أضف فحوص الجداول**

في `supabase/tests/01_schema.sql` غيّر `plan(13)` إلى `plan(15)` وأضف:

```sql
select has_table('public', 'event_persons', 'جدول event_persons موجود');
select has_table('public', 'event_locations', 'جدول event_locations موجود');
```

- [ ] **Step 2: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل الفحصين.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0006_join_tables.sql`:

```sql
create table public.event_persons (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  person_id uuid not null references public.persons (id) on delete cascade,
  role text,
  participation_evidence text,   -- explicit / group_based / disputed / possible / unknown
  citation_id uuid references public.citations (id),
  verification_level public.verification_level,
  notes text,
  unique (event_id, person_id, role)
);

create table public.event_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  location_id uuid not null references public.locations (id) on delete cascade,
  role text,                      -- start / stop / main_location / destination / route_point
  order_index integer not null default 0,
  notes text
);

create index on public.event_persons (event_id);
create index on public.event_persons (person_id);
create index on public.event_locations (event_id);
```

- [ ] **Step 4: طبّق وشغّل**

Run: `supabase db reset && supabase test db`
Expected: نجاح كل `01_schema.sql` (١٥).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0006_join_tables.sql supabase/tests/01_schema.sql
git commit -m "feat(db): add event_persons and event_locations join tables"
```

---

## Task 7: آلة حالات المراجعة (منع القفز — للجميع)

**Files:**
- Create: `supabase/migrations/0007_review_state_machine.sql`
- Create: `supabase/tests/03_state_machine.sql`

- [ ] **Step 1: اكتب اختبار منع القفز (سيفشل)**

أنشئ `supabase/tests/03_state_machine.sql`:

```sql
begin;
select plan(3);

insert into public.events (id, slug, title)
values ('00000000-0000-0000-0000-0000000000e1', 'badء-al-wahy', 'بدء الوحي');

-- (1) قفز مباشر draft → published يُرفض حتى بدور postgres (المدير الأعلى)
select throws_ok(
  $$ update public.events set review_status = 'published'
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'P0001',
  null,
  'يُرفض القفز draft → published'
);

-- (2) انتقال صحيح draft → submitted يُقبل
select lives_ok(
  $$ update public.events set review_status = 'submitted'
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'يُقبل draft → submitted'
);

-- (3) انتقال غير مجاور submitted → published يُرفض
select throws_ok(
  $$ update public.events set review_status = 'published'
     where id = '00000000-0000-0000-0000-0000000000e1' $$,
  'P0001',
  null,
  'يُرفض submitted → published'
);

select * from finish();
rollback;
```

- [ ] **Step 2: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل — لا trigger بعد، فالقفز ينجح خطأً.

- [ ] **Step 3: اكتب الـ migration**

أنشئ `supabase/migrations/0007_review_state_machine.sql`:

```sql
-- جدول الانتقالات المسموحة (مرجع البيانات)
create table public.review_transitions (
  from_status public.review_status not null,
  to_status   public.review_status not null,
  primary key (from_status, to_status)
);

insert into public.review_transitions (from_status, to_status) values
  ('draft','submitted'),
  ('submitted','shariah_approved'),
  ('submitted','needs_revision'),
  ('submitted','rejected'),
  ('shariah_approved','approved'),
  ('shariah_approved','needs_revision'),
  ('shariah_approved','rejected'),
  ('approved','published'),
  ('approved','needs_revision'),
  ('published','approved'),
  ('needs_revision','submitted');

-- دالة عامة تتحقق من صحة الانتقال — تُطبّق على الجميع (حتى المدير)
create or replace function public.enforce_review_transition()
returns trigger
language plpgsql
as $$
begin
  if new.review_status is distinct from old.review_status then
    if not exists (
      select 1 from public.review_transitions
      where from_status = old.review_status and to_status = new.review_status
    ) then
      raise exception 'انتقال غير مسموح: % → %', old.review_status, new.review_status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_events_transition
  before update on public.events
  for each row execute function public.enforce_review_transition();

create trigger trg_persons_transition
  before update on public.persons
  for each row execute function public.enforce_review_transition();

create trigger trg_locations_transition
  before update on public.locations
  for each row execute function public.enforce_review_transition();
```

- [ ] **Step 4: طبّق وشغّل**

Run: `supabase db reset && supabase test db`
Expected: نجاح فحوص `03_state_machine.sql` (٣).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0007_review_state_machine.sql supabase/tests/03_state_machine.sql
git commit -m "feat(db): enforce review state-machine transitions for all roles"
```

---

## Task 8: سياسات RLS (رؤية anon + صلاحيات الأدوار)

**Files:**
- Create: `supabase/migrations/0008_rls_policies.sql`
- Create: `supabase/tests/00_helpers.sql`
- Create: `supabase/tests/04_rls.sql`

- [ ] **Step 1: اكتب دوال مساعدة للاختبار**

أنشئ `supabase/tests/00_helpers.sql`:

```sql
-- انتحال مستخدم بدور معيّن داخل الاختبار
create or replace function tests.authenticate_as(p_user uuid)
returns void language sql as $$
  select set_config('role', 'authenticated', true);
  select set_config('request.jwt.claims',
    json_build_object('sub', p_user::text, 'role', 'authenticated')::text, true);
$$;

create or replace function tests.as_anon()
returns void language sql as $$
  select set_config('role', 'anon', true);
  select set_config('request.jwt.claims', null, true);
$$;
```

> ملاحظة: مخطط `tests` يولّده pgTAP في بيئة supabase. إن لم يوجد، أضف `create schema if not exists tests;` في أول الملف.

- [ ] **Step 2: اكتب اختبار RLS (سيفشل)**

أنشئ `supabase/tests/04_rls.sql`:

```sql
begin;
select plan(4);

create schema if not exists tests;
\i supabase/tests/00_helpers.sql

-- مستخدمون بأدوار
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000a001', 'author@test.local'),
  ('00000000-0000-0000-0000-00000000a002', 'admin@test.local');
update public.profiles set role = 'author' where id = '00000000-0000-0000-0000-00000000a001';
update public.profiles set role = 'admin'  where id = '00000000-0000-0000-0000-00000000a002';

-- حدثان: منشور ومسودة
insert into public.events (id, slug, title, review_status) values
  ('00000000-0000-0000-0000-0000000000p1', 'published-ev', 'منشور', 'published'),
  ('00000000-0000-0000-0000-0000000000d1', 'draft-ev', 'مسودة', 'draft');

-- (1) anon يرى المنشور فقط
select tests.as_anon();
select is(
  (select count(*)::int from public.events),
  1,
  'anon يرى الأحداث المنشورة فقط'
);

-- (2) anon لا يستطيع الإدراج
select throws_ok(
  $$ insert into public.events (slug, title) values ('x','x') $$,
  '42501',
  null,
  'anon لا يستطيع الإدراج'
);

-- (3) المؤلف يرى المسودات
select tests.authenticate_as('00000000-0000-0000-0000-00000000a001');
select is(
  (select count(*)::int from public.events),
  2,
  'المؤلف يرى المنشور والمسودة'
);

-- (4) المؤلف لا يقدر ينشر (الانتقال approved→published ليس له)
select tests.authenticate_as('00000000-0000-0000-0000-00000000a001');
select throws_ok(
  $$ update public.events set review_status = 'submitted'
     where id = '00000000-0000-0000-0000-0000000000d1';
     update public.events set review_status = 'published'
     where id = '00000000-0000-0000-0000-0000000000d1' $$,
  null,
  null,
  'المؤلف لا يقدر يدفع للنشر'
);

select * from finish();
rollback;
```

- [ ] **Step 3: شغّل وتحقّق من الفشل**

Run: `supabase test db`
Expected: فشل — RLS غير مفعّل، فـ anon يرى كل شيء.

- [ ] **Step 4: اكتب الـ migration**

أنشئ `supabase/migrations/0008_rls_policies.sql`:

```sql
-- تفعيل RLS على كل الجداول
alter table public.profiles        enable row level security;
alter table public.sources         enable row level security;
alter table public.citations       enable row level security;
alter table public.events          enable row level security;
alter table public.persons         enable row level security;
alter table public.locations       enable row level security;
alter table public.claims          enable row level security;
alter table public.claim_citations enable row level security;
alter table public.event_persons   enable row level security;
alter table public.event_locations enable row level security;

-- profiles: كل مستخدم يقرأ profile نفسه؛ المدير يقرأ الكل
create policy profiles_self_read on public.profiles
  for select using (id = auth.uid() or public.current_role_name() = 'admin');

-- ===== كيانات المحتوى: قراءة =====
-- العامة (anon + authenticated) ترى المنشور؛ المسجّلون بأي دور تحريري يرون الكل
create policy events_public_read on public.events
  for select using (
    review_status = 'published' or public.current_role_name() is not null
  );
create policy persons_public_read on public.persons
  for select using (
    review_status = 'published' or public.current_role_name() is not null
  );
create policy locations_public_read on public.locations
  for select using (
    review_status = 'published' or public.current_role_name() is not null
  );

-- ===== كيانات المحتوى: كتابة =====
-- الإدراج: أي دور تحريري (author فأعلى)
create policy events_insert on public.events
  for insert with check (public.current_role_name() is not null);
create policy persons_insert on public.persons
  for insert with check (public.current_role_name() is not null);
create policy locations_insert on public.locations
  for insert with check (public.current_role_name() is not null);

-- التحديث: من له دور تحريري يستطيع التحديث؛ صحّة الانتقال يفرضها trigger 0007.
-- تقييد الانتقالات بالدور: نسمح بالتحديث ثم نمنع الانتقالات غير المصرّح بها للدور عبر دالة.
create or replace function public.can_make_transition(
  p_old public.review_status, p_new public.review_status
) returns boolean
language sql stable security definer set search_path = public as $$
  select case public.current_role_name()
    when 'admin' then p_new in ('published','approved','needs_revision') or p_old = p_new
    when 'editor' then (p_old = 'shariah_approved' and p_new in ('approved','needs_revision','rejected')) or p_old = p_new
    when 'shariah_reviewer' then (p_old = 'submitted' and p_new in ('shariah_approved','needs_revision','rejected')) or p_old = p_new
    when 'author' then (p_old in ('draft','needs_revision') and p_new in ('submitted', p_old)) or p_old = p_new
    else false
  end;
$$;

create policy events_update on public.events
  for update using (public.current_role_name() is not null)
  with check (public.can_make_transition(review_status, review_status) or public.current_role_name() is not null);

-- ملاحظة: الفحص الدقيق للانتقال-بالدور يتم في trigger إضافي يقارن OLD/NEW (الخطوة 5).
create policy persons_update on public.persons
  for update using (public.current_role_name() is not null);
create policy locations_update on public.locations
  for update using (public.current_role_name() is not null);

-- ===== التوثيق والربط: قراءة عامة، كتابة للأدوار التحريرية =====
create policy sources_read on public.sources
  for select using (status = 'approved' or public.current_role_name() is not null);
create policy citations_read on public.citations
  for select using (public.current_role_name() is not null);
create policy claims_read on public.claims
  for select using (public.current_role_name() is not null);
create policy claim_citations_read on public.claim_citations
  for select using (public.current_role_name() is not null);
create policy event_persons_read on public.event_persons
  for select using (public.current_role_name() is not null);
create policy event_locations_read on public.event_locations
  for select using (public.current_role_name() is not null);

-- كتابة عامة للأدوار التحريرية على جداول التوثيق/الربط
create policy sources_write on public.sources
  for all using (public.current_role_name() is not null) with check (public.current_role_name() is not null);
create policy citations_write on public.citations
  for all using (public.current_role_name() is not null) with check (public.current_role_name() is not null);
create policy claims_write on public.claims
  for all using (public.current_role_name() is not null) with check (public.current_role_name() is not null);
create policy claim_citations_write on public.claim_citations
  for all using (public.current_role_name() is not null) with check (public.current_role_name() is not null);
create policy event_persons_write on public.event_persons
  for all using (public.current_role_name() is not null) with check (public.current_role_name() is not null);
create policy event_locations_write on public.event_locations
  for all using (public.current_role_name() is not null) with check (public.current_role_name() is not null);
```

- [ ] **Step 5: أضف فرض الانتقال-بالدور في الـ trigger (تعزيز 0007)**

عدّل دالة `enforce_review_transition` في migration جديد `supabase/migrations/0009_transition_by_role.sql` لتفرض الدور أيضًا:

```sql
create or replace function public.enforce_review_transition()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.review_status is distinct from old.review_status then
    -- (أ) الانتقال موجود في جدول الانتقالات المسموحة
    if not exists (
      select 1 from public.review_transitions
      where from_status = old.review_status and to_status = new.review_status
    ) then
      raise exception 'انتقال غير مسموح: % → %', old.review_status, new.review_status
        using errcode = 'P0001';
    end if;
    -- (ب) الدور الحالي مخوّل بهذا الانتقال (يُتجاوز فقط في سياق الخدمة بلا مستخدم)
    if auth.uid() is not null
       and not public.can_make_transition(old.review_status, new.review_status) then
      raise exception 'الدور الحالي غير مخوّل بالانتقال: % → %', old.review_status, new.review_status
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
```

- [ ] **Step 6: طبّق وشغّل كل الاختبارات**

Run: `supabase db reset && supabase test db`
Expected: نجاح كل ملفات الاختبار (`01`–`04`).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/0008_rls_policies.sql supabase/migrations/0009_transition_by_role.sql \
        supabase/tests/00_helpers.sql supabase/tests/04_rls.sql
git commit -m "feat(db): enable RLS, public-read-published, role-gated transitions"
```

---

## Task 9: بذرة المصادر المرشّحة وأدوار البداية

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: اكتب البذرة**

أنشئ `supabase/seed.sql` (تُشغَّل تلقائيًا مع `supabase db reset`):

```sql
-- مصادر مرشّحة (status='proposed' حتى تمر بآلية الاعتماد — لبنة ١٧)
insert into public.sources (slug, title, author, source_type, reliability, status) values
  ('quran', 'القرآن الكريم', null, 'quran', 'primary', 'approved'),
  ('sahih-bukhari', 'صحيح البخاري', 'محمد بن إسماعيل البخاري', 'hadith', 'primary', 'proposed'),
  ('sahih-muslim', 'صحيح مسلم', 'مسلم بن الحجاج', 'hadith', 'primary', 'proposed'),
  ('durar-sunniyya', 'الموسوعة الحديثية — الدرر السنية', null, 'grading_reference', 'high', 'proposed'),
  ('sira-ibn-hisham', 'السيرة النبوية لابن هشام', 'ابن هشام', 'sirah', 'high', 'proposed'),
  ('raheeq', 'الرحيق المختوم', 'صفي الرحمن المباركفوري', 'sirah', 'medium', 'proposed'),
  ('sira-sahiha-omari', 'السيرة النبوية الصحيحة', 'أكرم ضياء العمري', 'sirah', 'high', 'proposed'),
  ('zad-almaad', 'زاد المعاد', 'ابن القيم', 'sirah', 'high', 'proposed')
on conflict (slug) do nothing;
```

- [ ] **Step 2: طبّق وتحقّق**

Run: `supabase db reset`
ثم: `psql "$(supabase status -o env | grep DB_URL | cut -d= -f2- | tr -d '\"')" -c "select count(*) from public.sources;"`
Expected: `8`.

- [ ] **Step 3: Commit**

```bash
git add supabase/seed.sql
git commit -m "chore(db): seed candidate sources and grading references"
```

---

## Task 10: نسخ احتياطي يدوي + توثيق م٠

**Files:**
- Create: `scripts/db-dump.sh`
- Create: `README.md`

- [ ] **Step 1: اكتب سكربت تصدير**

أنشئ `scripts/db-dump.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
# تصدير كامل لقاعدة البيانات المحلية (مخطط + بيانات) بطابع زمني يُمرَّر كوسيط
STAMP="${1:?مرّر طابعًا زمنيًا، مثل: ./scripts/db-dump.sh 2026-06-18-1200}"
OUT="backups/${STAMP}.sql"
mkdir -p backups
supabase db dump --local --data-only -f "backups/${STAMP}-data.sql"
supabase db dump --local -f "${OUT}"
echo "تم التصدير إلى ${OUT}"
```

ثم: `chmod +x scripts/db-dump.sh` وأضف `backups/` إلى `.gitignore`.

- [ ] **Step 2: جرّب التصدير**

Run: `./scripts/db-dump.sh 2026-06-18-test`
Expected: يُنشئ `backups/2026-06-18-test.sql` وملف البيانات.

- [ ] **Step 3: اكتب README**

أنشئ `README.md`:

```markdown
# موسوعة السيرة (اسم مؤقت)

مشروع معرفي موثّق للسيرة النبوية. التصور الكامل في `docs/CONCEPT.md`.

## م٠ — نواة قاعدة البيانات (الحالية)
- المخطط والأدوار وبوابة المراجعة في `supabase/migrations/`.
- الاختبارات في `supabase/tests/` (pgTAP).

## أوامر
- تشغيل محلي: `supabase start`
- تطبيق المخطط + البذرة: `supabase db reset`
- الاختبارات: `supabase test db`
- نسخة احتياطية: `./scripts/db-dump.sh <طابع-زمني>`

## ملاحظة
البيانات تُدخل يدويًا وتمر ببوابة مراجعة إلزامية (لا يُنشر شيء قبل المراجعة الشرعية ثم الاعتماد).
```

- [ ] **Step 4: Commit**

```bash
git add scripts/db-dump.sh README.md .gitignore
git commit -m "chore: add db dump script and project README"
```

---

## مراجعة ذاتية للخطة

- **تغطية المخطط (لبنة ٩، ١٤):** events/persons/locations/sources/citations/claims/claim_citations/event_persons/event_locations/profiles — كلها مغطّاة (المهام ٢–٦). ✅
- **المعلومة المفردة (لبنة ١٠):** الحقول (نص/نوع/حاوية/درجة/ملاحظة/ترتيب) + علاقة الاستشهاد (relation) — Task 5. ✅
- **درجات التوثيق وثقة التاريخ/المكان (لبنة ١١، ١٢):** enums `verification_level` و`confidence_level` — Task 1، مستخدمة في events/locations/claims. ✅
- **ننقل فقط (لبنة ٣):** قيد `citation_grading_needs_source` — Task 3. ✅
- **بوابة المراجعة الإلزامية للجميع (لبنة ١٥، ١٩):** trigger الانتقالات + منع القفز حتى لـ postgres/admin — Task 7، وتقييد الدور — Task 8 step 5. ✅
- **آلية اعتماد المصادر (لبنة ١٧):** `source_status` + بذرة بحالة `proposed` — Task 1، 9. ✅
- **النسخ الاحتياطي من اليوم الأول (لبنة ١٩):** سكربت dump + المخطط في Git — Task 10. ✅
- **الربط الذكي (لبنة ١٩):** `body jsonb` لمحتوى غني + `claims.display_order` — يدعم محرّر م١ دون بناء المحرّر هنا. ✅
- **الاسم القابل للتغيير (لبنة المقدمة):** لا اسم مزروع في المخطط؛ README يحمل اسمًا مؤقتًا فقط. ✅

**خارج نطاق م٠ عمدًا (مراحل لاحقة):** أداة الإدخال/المحرّر (م١)، صفحات العرض (م٣+)، hadiths/verses/relations/tags/media (لبنة ٩)، البحث العربي (م١٣)، الخرائط (م١٠).
