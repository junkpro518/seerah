# Tasks: م١ — أداة الإدخال/المحرّر (Authoring Tool)

**Feature**: `002-m1-authoring-tool` | **Spec**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/operations.md](./contracts/operations.md)

> **⚠️ قيد فوق كل المهام (SC-009):** لا تغيير على مخطط م٠ إطلاقًا — لا migration، لا ALTER، لا جدول/عمود. أي مهمة تكشف حاجة مخطط = **توقّف فورًا واسأل المالك** (ترحيل منفصل في مسار م٠ بإذنه). الكتابة كلها داخل أعمدة م٠ القائمة (`body jsonb`, `updated_at`, `auth app_metadata`).
> **بوابة TDD (مبدأ VII):** كل وحدة منطق حرجة لها اختبار يسبقها ويفشل (أحمر) ثم التنفيذ (أخضر). E2E للمسارات الحرجة (الدخول/2FA، تحرير معلومة، انتقال مراجعة). كل impl `blockedBy` اختباره.
> **الأمان:** service role في الخادم فقط (لا يدخل حزمة المتصفح — SC-008)؛ كل كتابة تتطلّب aal2 (محاولة aal1 تُرفض — SC-001).

---

## Phase 1: Setup (تهيئة)

- [ ] T001 تهيئة مشروع Next.js (App Router + TypeScript) في جذر المستودع ببنية `app/`, `lib/`, `tests/` حسب plan.md
- [ ] T002 [P] إعداد Tailwind + RTL (`dir="rtl" lang="ar"` + خصائص منطقية) في `app/layout.tsx` و`tailwind.config.ts`
- [ ] T003 [P] عملاء Supabase: `lib/supabase/client.ts` (متصفّح، anon) و`lib/supabase/server.ts` (@supabase/ssr بالكوكيز)
- [ ] T004 عميل الإدارة الخادمي `lib/supabase/admin.ts` (service role) مع حارس استيراد `server-only` (يفشل البناء إن استُورد في العميل)
- [ ] T005 [P] `.env.example`: `NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY` (عام) + `SUPABASE_SERVICE_ROLE_KEY` (خادم فقط) + توثيق في README
- [ ] T006 [P] إعداد بيئة الاختبار: Vitest + RTL (`tests/unit`) وPlaywright (`tests/e2e`) + سكربتات مكدّس Supabase **محلي زائل** (`supabase start` + `db reset`) — E2E لا يمسّ السحابي
- [ ] T007 [P] فحص آلي يفشل إن أُشير لـ `lib/supabase/admin.ts` أو مفتاح service role من أي Client Component (حارس SC-008) في `tests/unit/no-service-role-in-client.test.ts`

**Checkpoint:** مشروع يعمل، Tailwind RTL، عملاء Supabase، بيئة اختبار محلية، حارس الأمان.

---

## Phase 2: Foundational (أساس حاجب لكل القصص)

- [ ] T008 [P] اختبار وحدة لمعين القفل التفاؤلي (تعارض عند تغيّر `updated_at`) في `tests/unit/optimistic.test.ts` — يجب أن يفشل (أحمر)
- [ ] T009 تنفيذ معين القفل التفاؤلي `lib/data/optimistic.ts` (`update ... where id and updated_at`؛ نتيجة تعارض عند صفر صفوف) → أخضر. **[blockedBy T008]** — (FR-030)
- [ ] T010 [P] اختبار وحدة لحارس aal2 (aal1 يُرفض، aal2 يُسمح) في `tests/unit/assertAal2.test.ts` — أحمر
- [ ] T011 تنفيذ حارس aal2 `lib/auth/assertAal2.ts` وربطه بـ `app/(admin)/layout.tsx` (رفض aal1 برسالة واضحة لا خطأ خام) → أخضر. **[blockedBy T010]** — (FR-004)
- [ ] T012 [P] معينات الأدوار `lib/auth/roles.ts` (قراءة الدور/الملف، is_staff/is_admin) عبر جلسة المستخدم
- [ ] T013 طبقة وصول بيانات تحترم RLS `lib/data/*.ts` (قراءة/كتابة مغلّفة بأنواع عبر جلسة المستخدم — anon key)
- [ ] T014 هيكل واجهة الإدارة `app/(admin)/layout.tsx` بتنقّل حسب الدور + RTL

**Checkpoint:** القفل التفاؤلي وحارس aal2 والأدوار وطبقة الوصول جاهزة؛ يمكن بناء القصص.

---

## Phase 3: US1 — دخول آمن + 2FA إلزامي (P1) 🎯 أساس MVP

> **هدف القصة:** لا وصول لأي تحرير قبل بلوغ aal2. **اختبار مستقل:** دخول → حجب aal1 → تسجيل TOTP → رموز احتياطية → تحقّق → aal2 → وصول؛ وكتابة بـ aal1 تُرفض.

- [ ] T015 [P] [US1] اختبار وحدة: توليد/تجزئة/تحقّق الرموز الاحتياطية (أحادية الاستخدام) في `tests/unit/recovery.test.ts` — أحمر
- [ ] T016 [P] [US1] اختبار E2E: دخول → حجب aal1 → تسجيل TOTP → حفظ الرموز → تحقّق → aal2 → وصول `(admin)`؛ وكتابة بـ aal1 تُرفض (42501) في `tests/e2e/auth-2fa.spec.ts` — أحمر
- [ ] T017 [US1] صفحة الدخول `app/(auth)/login/` + جلسة عبر @supabase/ssr. **[blockedBy T016]**
- [ ] T018 [US1] تدفّق 2FA: enroll/challenge/verify في `app/(auth)/mfa/` (Supabase MFA TOTP، بلوغ aal2). **[blockedBy T016]**
- [ ] T019 [US1] الرموز الاحتياطية: تُولَّد عند التسجيل، تُعرض مرة، وتُجزّأ في `auth app_metadata` عبر server action (admin.ts) — **بلا DDL**. **[blockedBy T015, T018]** — (FR-005)
- [ ] T020 [US1] تدفّق الاستعادة `app/(auth)/mfa/recovery/` (تحقّق رمز → حذف العامل → إعادة تسجيل). **[blockedBy T019]**
- [ ] T021 [US1] إعادة تعيين 2FA بيد المدير (server action، service role، خادم فقط) في `app/(admin)/admin/`. **[blockedBy T018]**
- [ ] T022 [US1] فرض aal2 عبر كل مسارات `(admin)` ومسارات الكتابة. **[blockedBy T011, T018]** — (SC-001)

**Checkpoint:** الدخول و2FA يعملان؛ لا كتابة بلا aal2 (E2E أخضر).

---

## Phase 4: US2 — محرّر المعلومة المفردة الموثّقة (P1)

> **هدف القصة:** معلومة بحاوية واحدة + استشهاد معتمد + درجة، بفرض قواعد م٠. **اختبار مستقل:** إنشاء وتقديم معلومة موثّقة؛ ومنع المخالفات برسائل استخدام.

- [ ] T023 [P] [US2] اختبار وحدة: فحوص قواعد المعلومة في العميل (حاوية واحدة، درجة تتطلّب مصدر حكم، تقديم يتطلّب استشهادًا) في `tests/unit/claim-rules.test.ts` — أحمر
- [ ] T024 [P] [US2] اختبار E2E: كاتب ينشئ معلومة (حاوية واحدة + استشهاد من approved + درجة) ويقدّمها؛ ويُمنع عند حاويتين/بلا استشهاد/درجة بلا مصدر برسائل استخدام في `tests/e2e/claim-authoring.spec.ts` — أحمر
- [ ] T025 [US2] واجهة محرّر المعلومة `app/(admin)/claims/` (منتقي حاوية واحدة، اختيار درجة). **[blockedBy T024]**
- [ ] T026 [US2] ربط الاستشهادات من **المصادر المعتمدة فقط** (lib/data + UI). **[blockedBy T024]**
- [ ] T027 [US2] server actions: إنشاء/تعديل/تقديم المعلومة + قفل تفاؤلي + عرض أخطاء قيود م٠ كرسائل استخدام. **[blockedBy T023, T009, T025]** — (FR-006..011)

**Checkpoint:** تحرير المعلومة الموثّقة يعمل، والقواعد مفروضة (E2E أخضر).

---

## Phase 5: US3 — المحرّر الغني وربط المعلومات (P1)

> **هدف القصة:** سرد TipTap + عُقَد claimRef + ترقيم [n] مشتق + هايلايت إداري. **اختبار مستقل:** إدراج إشارتين → [1],[2]؛ إعادة ترتيب تُحدّث؛ body_plain متزامن.

- [ ] T028 [P] [US3] اختبار وحدة: اشتقاق ترقيم [n] (ترتيب/إعادة ترتيب) + تخطيط ألوان الهايلايت في `tests/unit/claimref.test.ts` — أحمر
- [ ] T029 [P] [US3] اختبار E2E: كتابة سرد، إدراج إشارتين → [1],[2]؛ إعادة الترتيب تُحدّث؛ الحفظ → body_plain متزامن في `tests/e2e/narrative-editor.spec.ts` — أحمر
- [ ] T030 [US3] عقدة TipTap `claimRef` (inline، سمة claimId) في `lib/editor/claim-ref-node.ts` — متوافقة مع `body jsonb` (لا DDL). **[blockedBy T028]**
- [ ] T031 [US3] اشتقاق [n] وقت العرض + الهايلايت الإداري (ألوان القوائم المرجعية) في `lib/editor/`. **[blockedBy T028, T030]**
- [ ] T032 [US3] واجهة المحرّر الغني `app/(admin)/entities/` (حفظ body jsonb لكل لغة + قفل تفاؤلي؛ body_plain يشتقّه م٠). **[blockedBy T029, T030, T009]** — (FR-012..016)

**Checkpoint:** السرد الغني والربط والترقيم والهايلايت تعمل (E2E أخضر). **— حدّ MVP (US1+US2+US3).**

---

## Phase 6: US4 — سير المراجعة عبر الواجهة (P2)

> **هدف القصة:** كل دور يرى/يصنع المسموح فقط؛ آلة حالات م٠ تفرض. **اختبار مستقل:** انتقال بالدور عبر السلسلة؛ الممنوع يُرفض.

- [ ] T033 [P] [US4] اختبار وحدة: `availableTransitions` تُعيد المسموح فقط حسب الدور/الطبقة/الحالة في `tests/unit/transitions.test.ts` — أحمر
- [ ] T034 [P] [US4] اختبار E2E: سلسلة `submitted→shariah_approved→approved→published` بالأدوار تُظهر المسموح فقط؛ الممنوع يُرفض من م٠ في `tests/e2e/review-workflow.spec.ts` — أحمر
- [ ] T035 [US4] `availableTransitions` (قراءة review_transitions) في `lib/data/transitions.ts`. **[blockedBy T033]**
- [ ] T036 [US4] لوحة المراجعة + `applyTransition` (قفل تفاؤلي؛ م٠ يفرض الدور/الطبقة) في `app/(admin)/review/`. **[blockedBy T034, T035]** — (FR-017..019)

**Checkpoint:** سير المراجعة يعمل عبر الواجهة، بلا تجاوز.

---

## Phase 7: US5 — اقتراح/اعتماد المصادر (P2)

- [ ] T037 [P] [US5] اختبار E2E: اقتراح مصدر (proposed، غير قابل للربط) → المدير يعتمده (approved، قابل للربط، مدقّق) في `tests/e2e/sources.spec.ts` — أحمر
- [ ] T038 [US5] واجهة اقتراح/قائمة المصادر `app/(admin)/sources/`. **[blockedBy T037]**
- [ ] T039 [US5] اعتماد المصدر (aal2-admin) + انعكاس التدقيق. **[blockedBy T037, T038]** — (FR-020/021)

**Checkpoint:** مسار المصادر يعمل (اقتراح → اعتماد → قابل للاستشهاد).

---

## Phase 8: US6 — الربط الذكي (P3)

- [x] T040 [P] [US6] اختبار وحدة: استعلام الاقتراح يُعيد معلومات/مصادر ذات صلة ضمن رؤية الدور في `tests/unit/smart-link.test.ts` — أحمر
- [x] T041 [US6] اقتراحات الربط الذكي في المحرّر `lib/editor/` + UI. **[blockedBy T040, T030]** — (FR-022)

**Checkpoint:** الربط الذكي يقترح ضمن صلاحية الدور.

---

## Phase 9: Polish & Cross-cutting

- [x] T042 [P] أمان: تأكيد آلي أن حزمة العميل خالية من service role + تغطية رفض الكتابة بـ aal1 (SC-008/SC-001) في `tests/e2e/security.spec.ts`
- [x] T043 [P] **حارس SC-009:** تأكيد أن م١ لم يضف/يعدّل أي ملف تحت `supabase/migrations/` (صفر تغيير مخطط) — فحص في CI/سكربت
- [x] T044 [P] تدقيق RTL/وصولية على شاشات الإدارة (عربي، خصائص منطقية)
- [x] T045 تشغيل كامل الوحدة + E2E (كل المسارات الحرجة خضراء) حسب quickstart.md
- [x] T046 [P] إعداد النشر على VPS (Contabo) عبر Coolify/Dokploy (Dockerfile/build) + ربط البيئة (service role خادم فقط)
- [x] T047 [P] تحديث README بأوامر تشغيل/اختبار/نشر م١

---

## Dependencies (ملخص)

- **Setup (T001-T007)** يحجب كل ما بعده.
- **Foundational (T008-T014)** يحجب كل القصص (القفل التفاؤلي + حارس aal2 + طبقة الوصول).
- كل **impl** `blockedBy` اختباره (بوابة TDD).
- ترتيب القصص بالأولوية: US1 (P1) → US2 (P1) → US3 (P1) → US4 (P2) → US5 (P2) → US6 (P3).
- US1 أساس حاجب (بلا aal2 لا كتابة في بقية القصص).

## فرص التوازي

- T002/T003/T005/T006/T007 (إعداد) متوازية.
- اختبارات الوحدة المعلَّمة [P] تُكتب بالتوازي قبل تنفيذها.
- بعد US1: US2 وUS3 وUS4 وUS5 مستقلّة نسبيًا (تشترك في الأساس فقط).
- Polish: T042/T043/T044/T046/T047 متوازية.

## MVP المقترح

**US1 + US2 + US3** (دخول+2FA + محرّر المعلومة + المحرّر الغني) = أصغر منتج يعمل: عضو يدخل بأمان ويُدخل معلومة موثّقة بسرد مربوط. ثم US4/US5/US6.

## استراتيجية التنفيذ

1. Setup ثم Foundational.
2. لكل وحدة حرجة: اختبار أحمر → تنفيذ أخضر → commit.
3. E2E للمسارات الثلاثة الحرجة يقود كل قصة P1.
4. **أي حاجة مخطط = توقّف واسأل المالك (لا DDL في م١).**
5. بعد كل قصة: checkpoint يثبت استقلالها.
