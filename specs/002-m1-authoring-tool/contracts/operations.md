# Contracts — عمليات م١ (Server Actions / Route Handlers)

> عقود سلوكية لعمليات الواجهة فوق قاعدة م٠. كلها تحترم RLS؛ ما لم يُذكر "service role" فالعملية بجلسة المستخدم (anon key + JWT). **اشتراط aal2 = الواجهة تمنع مبكرًا + RLS م٠ يرفض فعليًا.** لا عملية تغيّر المخطط.

## فئات الصلاحية
- **public**: بلا جلسة (الدخول فقط).
- **authed**: جلسة صالحة (قد تكون aal1).
- **aal2-staff**: جلسة aal2 + دور موظّف (author/shariah_reviewer/editor/admin).
- **aal2-admin**: جلسة aal2 + دور admin.
- **server-admin**: تُنفَّذ في الخادم بـ service role (لا تصل العميل).

---

## A) المصادقة و2FA

| العملية | الفئة | المدخل → المخرج | السلوك/الفرض |
|---------|------|------------------|---------------|
| `signIn` | public | (email, password) → جلسة aal1 | بعدها يُلزَم ببلوغ aal2 قبل `(admin)` |
| `mfaEnroll` | authed | () → (qr/secret, factorId) | يبدأ تسجيل TOTP (Supabase MFA) |
| `mfaVerify` | authed | (factorId, code) → جلسة aal2 | عند أول تسجيل: يولّد ويعرض **الرموز الاحتياطية** مرة، ويخزّن hashes في app_metadata (server-admin) |
| `mfaRecover` | authed | (recoveryCode) → عامل محذوف + إعادة تسجيل | يطابق hash (server) → يحذف العامل → يستهلك الرمز |
| `adminResetMfa` | aal2-admin → server-admin | (userId) → عامل العضو محذوف | المدير يعيد تعيين 2FA لعضو فقد جهازه ورموزه |
| `assertAal2` | authed | () → سماح/منع | حارس مسارات `(admin)`: يرفض aal1 برسالة واضحة (لا خطأ خام) |

## B) محرّر المعلومة (claims)

> **نموذج المعلومة (قرار المالك 2026-06-24، يطابق المخطط المبني + لبنة ٣٣):** المعلومة تحمل
> **نصّها لكل لغة** في `claim_translations` (عنوان/ملخّص + body) إضافةً لبنيتها في `claims`
> (حاوية واحدة + نوع + درجة + حالة). الطور ٥/US3 يربط سرد الكيانات بالمعلومة عبر `claimRef`.
> (تصحيح عقد سابق صاغ المعلومة "بنيوية فقط" — بلا تغيير مخطط؛ claim_translations مبني في م٠.)

| العملية | الفئة | المدخل → المخرج | الفرض |
|---------|------|------------------|--------|
| `createClaim` | aal2-staff | (containerType, containerId, claimType, docGrade) → claim(draft) | **حاوية واحدة** (قيد م٠ num_nonnulls=1)؛ الواجهة تمنع اختيار حاويتين |
| `saveClaimText` | aal2-staff | (claimId, lang, title, summary, loadedUpdatedAt?) → claim_translation | نصّ المعلومة لكل لغة (عنوان/ملخّص)؛ upsert على (claim_id, lang)؛ قفل تفاؤلي عند التعديل |
| `updateClaim` | aal2-staff | (id, fields, loadedUpdatedAt) → claim | **قفل تفاؤلي** عبر updated_at؛ تعارض → خطأ "تغيّر الصف" |
| `linkCitation` | aal2-staff | (claimId, citationId, relation) → claim_citation | الاختيار من **مصادر approved فقط** (قاعدة تطبيق — لا سند DB في م٠) |
| `submitClaim` | aal2-staff | (id, loadedUpdatedAt) → claim(submitted) | يُرفض إن لا استشهاد حيّ / درجة تتطلّب مصدر حكم بلا مصدر (قيود م٠) — تُعرض كرسائل استخدام مشتقّة من فحص العميل (لا مطابقة نصّ خطأ DB) |

## C) السرد الغني (translations)

| العملية | الفئة | المدخل → المخرج | الفرض |
|---------|------|------------------|--------|
| `saveNarrative` | aal2-staff | (entityType, entityId, lang, bodyJson, loadedUpdatedAt) → translation | يكتب `body jsonb` (يشمل عُقَد claimRef)؛ body_plain يشتقّه م٠؛ قفل تفاؤلي |
| `resolveClaimRefs` | aal2-staff | (bodyJson) → [claimId,…] بالترتيب | اشتقاق الترقيم/الهايلايت وقت العرض (قراءة لا كتابة) |

## D) سير المراجعة (transitions)

| العملية | الفئة | المدخل → المخرج | الفرض |
|---------|------|------------------|--------|
| `availableTransitions` | aal2-staff | (entity, currentState, role, layer) → [transition] | تعرض **المسموح فقط** (من review_transitions) |
| `applyTransition` | aal2-staff | (id, toState, loadedUpdatedAt) → entity | تستدعي UPDATE؛ آلة حالات م٠ تفرض الدور/الطبقة/شرط الطبقتين؛ رفض → رسالة |

## E) المصادر

| العملية | الفئة | المدخل → المخرج | الفرض |
|---------|------|------------------|--------|
| `proposeSource` | aal2-staff | (fields) → source(proposed) | |
| `approveSource` | aal2-admin | (id, loadedUpdatedAt) → source(approved) | يُدقَّق ويُنتج إشعارًا (سلوك م٠) |

## F) الإدارة (admin)

| العملية | الفئة | المدخل → المخرج | الفرض |
|---------|------|------------------|--------|
| `createMember` | aal2-admin → server-admin | (email, role) → حساب | إنشاء الحسابات بيد المدير (لا تسجيل ذاتي عام) |
| `viewAudit` / `viewOutbox` | aal2-admin | (filters) → صفوف | قراءة admin فقط (RLS م٠) |

---

## عقد عقدة claimRef (TipTap/ProseMirror)
- النوع: `claimRef` (inline). السمة: `claimId: uuid`. تُسلسَل ضمن `body jsonb`.
- الترقيم `[n]`: مشتق بترتيب الظهور لكل لغة، غير مخزَّن.
- إشارة معلّقة (claim محذوف ناعمًا): تُعرض بحالة "غير متاح" بوضوح، لا تنكسر.

## عقد القفل التفاؤلي
- كل عملية تعديل تأخذ `loadedUpdatedAt` وتشترطه في WHERE.
- صفر صفوف متأثّرة ⇒ ترجع حالة تعارض قياسية (الواجهة: تحذير + إعادة تحميل).

## ثوابت أمنية (تُختبر)
- لا `service role` في حزمة العميل (SC-008).
- كل عمليات الكتابة aal2 (SC-001): محاولة بـ aal1 تُرفض (42501 من RLS).
- لا عملية تُصدر DDL أو تمسّ مخطط م٠ (SC-009).
