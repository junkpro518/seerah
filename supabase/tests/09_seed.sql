-- M0 / T033: verify the candidate-source seed (supabase/seed.sql).
-- RED until seed.sql is added (db reset applies it before the tests run).

select plan(3);

select is(
  (select count(*)::int from public.sources where slug in (
    'quran', 'sahih-bukhari', 'sahih-muslim', 'al-durar-al-saniyyah',
    'sirah-ibn-hisham', 'al-raheeq-al-makhtum', 'al-sira-al-nabawiyya-al-sahiha', 'zad-al-maad'
  )),
  8,
  'all 8 candidate sources are seeded'
);

select is(
  (select status_code from public.sources where slug = 'quran'),
  'approved',
  'the Quran is seeded as approved'
);

select is(
  (select count(*)::int from public.sources
   where status_code = 'proposed' and slug in (
    'sahih-bukhari', 'sahih-muslim', 'al-durar-al-saniyyah',
    'sirah-ibn-hisham', 'al-raheeq-al-makhtum', 'al-sira-al-nabawiyya-al-sahiha', 'zad-al-maad'
  )),
  7,
  'the other seven sources are seeded as proposed'
);

select * from finish();
