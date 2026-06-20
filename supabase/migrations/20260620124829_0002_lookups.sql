-- M0 / T007: reference lookup tables and Arabic display labels.

create table public.roles (
  code text primary key,
  rank integer not null,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.review_states (
  code text primary key,
  is_public_visible boolean not null default false,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.doc_grades (
  code text primary key,
  requires_grading_source boolean not null default false,
  is_publishable boolean not null default false,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.confidence_levels (
  code text primary key,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.claim_types (
  code text primary key,
  uses_confidence boolean not null default false,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.citation_relations (
  code text primary key,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.source_types (
  code text primary key,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.source_statuses (
  code text primary key,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.note_types (
  code text primary key,
  color text,
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.lookup_labels (
  domain text not null,
  code text not null,
  lang text not null references public.languages(code),
  label text not null check (btrim(label) <> ''),
  primary key (domain, code, lang)
);

insert into public.roles (code, rank, sort_order) values
  ('author', 10, 10),
  ('shariah_reviewer', 20, 20),
  ('editor', 30, 30),
  ('admin', 40, 40);

insert into public.review_states (code, is_public_visible, sort_order) values
  ('draft', false, 10),
  ('submitted', false, 20),
  ('shariah_approved', false, 30),
  ('approved', false, 40),
  ('published', true, 50),
  ('needs_revision', false, 60),
  ('rejected', false, 70);

insert into public.doc_grades (code, requires_grading_source, is_publishable, sort_order) values
  ('quranic', false, true, 10),
  ('sahih_hadith', true, true, 20),
  ('hasan_hadith', true, true, 30),
  ('authentic_athar', true, true, 40),
  ('sirah_accepted', false, true, 50),
  ('historically_famous', false, true, 60),
  ('disputed', false, true, 70),
  ('weak', false, false, 80),
  ('unverified', false, false, 90),
  ('rejected', false, false, 100);

insert into public.confidence_levels (code, sort_order) values
  ('confirmed', 10),
  ('likely', 20),
  ('approximate', 30),
  ('disputed', 40),
  ('unknown', 50);

insert into public.claim_types (code, uses_confidence, sort_order) values
  ('event_origin', false, 10),
  ('date', true, 20),
  ('place', true, 30),
  ('number', false, 40),
  ('participant', false, 50),
  ('name', false, 60),
  ('lineage', false, 70),
  ('conversion', false, 80),
  ('death', false, 90),
  ('position', false, 100),
  ('relationship', false, 110),
  ('quote', false, 120),
  ('lesson', false, 130);

insert into public.citation_relations (code, sort_order) values
  ('primary', 10),
  ('supporting', 20),
  ('alternative', 30),
  ('disputed', 40),
  ('weak', 50);

insert into public.source_types (code, sort_order) values
  ('quran', 10),
  ('hadith', 20),
  ('sirah', 30),
  ('tafsir', 40),
  ('history', 50),
  ('biography', 60),
  ('grading_reference', 70),
  ('other', 80);

insert into public.source_statuses (code, sort_order) values
  ('proposed', 10),
  ('approved', 20),
  ('rejected', 30);

insert into public.note_types (code, sort_order) values
  ('classification_reason', 10),
  ('scholarly_dispute', 20),
  ('editorial_note', 30),
  ('reviewer_note', 40),
  ('rejection_reason', 50);

insert into public.lookup_labels (domain, code, lang, label) values
  ('roles', 'author', 'ar', 'كاتب'),
  ('roles', 'shariah_reviewer', 'ar', 'مراجع شرعي'),
  ('roles', 'editor', 'ar', 'محرر'),
  ('roles', 'admin', 'ar', 'مدير'),

  ('review_states', 'draft', 'ar', 'مسودة'),
  ('review_states', 'submitted', 'ar', 'جاهز للمراجعة'),
  ('review_states', 'shariah_approved', 'ar', 'مجاز شرعيا'),
  ('review_states', 'approved', 'ar', 'معتمد تحريريا'),
  ('review_states', 'published', 'ar', 'منشور'),
  ('review_states', 'needs_revision', 'ar', 'يحتاج تعديل'),
  ('review_states', 'rejected', 'ar', 'مرفوض'),

  ('doc_grades', 'quranic', 'ar', 'موثق بالقرآن'),
  ('doc_grades', 'sahih_hadith', 'ar', 'حديث صحيح'),
  ('doc_grades', 'hasan_hadith', 'ar', 'حديث حسن'),
  ('doc_grades', 'authentic_athar', 'ar', 'أثر ثابت'),
  ('doc_grades', 'sirah_accepted', 'ar', 'ثابت في السيرة'),
  ('doc_grades', 'historically_famous', 'ar', 'مشهور تاريخيا'),
  ('doc_grades', 'disputed', 'ar', 'مختلف فيه'),
  ('doc_grades', 'weak', 'ar', 'رواية ضعيفة'),
  ('doc_grades', 'unverified', 'ar', 'غير موثق'),
  ('doc_grades', 'rejected', 'ar', 'مرفوض'),

  ('confidence_levels', 'confirmed', 'ar', 'مؤكد'),
  ('confidence_levels', 'likely', 'ar', 'راجح'),
  ('confidence_levels', 'approximate', 'ar', 'تقريبي'),
  ('confidence_levels', 'disputed', 'ar', 'مختلف فيه'),
  ('confidence_levels', 'unknown', 'ar', 'غير معروف'),

  ('claim_types', 'event_origin', 'ar', 'أصل حدث'),
  ('claim_types', 'date', 'ar', 'تاريخ'),
  ('claim_types', 'place', 'ar', 'مكان'),
  ('claim_types', 'number', 'ar', 'عدد'),
  ('claim_types', 'participant', 'ar', 'مشارك'),
  ('claim_types', 'name', 'ar', 'اسم'),
  ('claim_types', 'lineage', 'ar', 'نسب'),
  ('claim_types', 'conversion', 'ar', 'إسلام'),
  ('claim_types', 'death', 'ar', 'وفاة'),
  ('claim_types', 'position', 'ar', 'موقف'),
  ('claim_types', 'relationship', 'ar', 'علاقة'),
  ('claim_types', 'quote', 'ar', 'اقتباس'),
  ('claim_types', 'lesson', 'ar', 'درس'),

  ('citation_relations', 'primary', 'ar', 'أساسي'),
  ('citation_relations', 'supporting', 'ar', 'داعم'),
  ('citation_relations', 'alternative', 'ar', 'رواية بديلة'),
  ('citation_relations', 'disputed', 'ar', 'مختلف فيه'),
  ('citation_relations', 'weak', 'ar', 'ضعيف'),

  ('source_types', 'quran', 'ar', 'قرآن'),
  ('source_types', 'hadith', 'ar', 'حديث'),
  ('source_types', 'sirah', 'ar', 'سيرة'),
  ('source_types', 'tafsir', 'ar', 'تفسير'),
  ('source_types', 'history', 'ar', 'تاريخ'),
  ('source_types', 'biography', 'ar', 'تراجم'),
  ('source_types', 'grading_reference', 'ar', 'مرجع أحكام'),
  ('source_types', 'other', 'ar', 'أخرى'),

  ('source_statuses', 'proposed', 'ar', 'مقترح'),
  ('source_statuses', 'approved', 'ar', 'معتمد'),
  ('source_statuses', 'rejected', 'ar', 'مرفوض'),

  ('note_types', 'classification_reason', 'ar', 'سبب التصنيف'),
  ('note_types', 'scholarly_dispute', 'ar', 'خلاف علمي'),
  ('note_types', 'editorial_note', 'ar', 'ملاحظة تحريرية'),
  ('note_types', 'reviewer_note', 'ar', 'ملاحظة للمراجع'),
  ('note_types', 'rejection_reason', 'ar', 'سبب الرفض');
