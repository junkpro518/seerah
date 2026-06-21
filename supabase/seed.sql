-- M0 / T033: candidate sources (decision 17). Applied by `supabase db reset`
-- on a fresh database (before the pgTAP suite runs). The Quran is approved;
-- the rest are proposed and await editorial approval. Source approval later is
-- a real workflow event (audited + enqueued); seeding via INSERT is not.

insert into public.sources (slug, title, author, source_type_code, status_code) values
  ('quran',                          'القرآن الكريم',                 null,                          'quran',             'approved'),
  ('sahih-bukhari',                  'صحيح البخاري',                  'محمد بن إسماعيل البخاري',       'hadith',            'proposed'),
  ('sahih-muslim',                   'صحيح مسلم',                     'مسلم بن الحجاج',                'hadith',            'proposed'),
  ('al-durar-al-saniyyah',           'الدرر السنية',                  null,                          'grading_reference', 'proposed'),
  ('sirah-ibn-hisham',               'السيرة النبوية لابن هشام',      'عبد الملك بن هشام',             'sirah',             'proposed'),
  ('al-raheeq-al-makhtum',           'الرحيق المختوم',                'صفي الرحمن المباركفوري',         'sirah',             'proposed'),
  ('al-sira-al-nabawiyya-al-sahiha', 'السيرة النبوية الصحيحة',        'أكرم ضياء العمري',              'sirah',             'proposed'),
  ('zad-al-maad',                    'زاد المعاد في هدي خير العباد',  'ابن قيم الجوزية',               'sirah',             'proposed');
