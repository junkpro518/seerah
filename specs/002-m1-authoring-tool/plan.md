# Implementation Plan: م١ — أداة الإدخال/المحرّر (Authoring Tool)

**Branch**: `002-m1-authoring-tool` | **Date**: 2026-06-22 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-m1-authoring-tool/spec.md`

## Summary

واجهة Next.js (App Router) + Tailwind + RTL عربي، تتصل بقاعدة Supabase السحابية (م٠) وتفرض كل ثوابتها عبر RLS لا عبر الواجهة. تمكّن الفريق من: دخول آمن بـ 2FA (TOTP) إلزامي، تحرير المعلومات المفردة الموثّقة، كتابة السرد الغني (TipTap) مع ربط المعلومات وترقيم مشتق وهايلايت إداري، وسير مراجعة بالدور، واقتراح/اعتماد المصادر.

**النهج التقني (من Phase 0):** RLS + جلسة المستخدم (anon key) لكل عمليات المستخدم؛ المفتاح السري (service role) في الخادم فقط لعمليات الإدارة المحدودة (إعادة تعيين 2FA، إنشاء الحسابات). 2FA عبر Supabase Auth MFA (TOTP)؛ الرموز الاحتياطية تُخزَّن **مجزّأة في `auth.users` app_metadata** (بيانات لا DDL) فلا تمسّ مخطط م٠. القفل التفاؤلي عبر عمود `updated_at` القائم (لا تغيير مخطط). عقدة `claim_ref` داخل `body jsonb` القائم. الترقيم `[n]` يُشتق وقت العرض.

> **⚠️ قيد فوق كل شيء (SC-009):** **لا تغيير على مخطط م٠ إطلاقًا** (لا migration، لا ALTER، لا جدول/عمود جديد). كل تصميم م١ يستهلك القاعدة القائمة. أي حاجة مخطط = توقّف واسأل المالك (ترحيل منفصل في مسار م٠). تحقّقت الخطة من ذلك: **لا حاجة مخطط** (الرموز الاحتياطية في auth metadata، القفل عبر updated_at القائم).

## Technical Context

**Language/Version**: TypeScript 5.x، Node 20 LTS

**Primary Dependencies**: Next.js (App Router) · React 19 · Tailwind CSS · `@supabase/ssr` + `@supabase/supabase-js` · TipTap (ProseMirror)

**Storage**: Supabase السحابي القائم (م٠) — **يُستهلك بلا تغيير مخطط**. لا تخزين محلي جديد.

**Testing**: Vitest + React Testing Library (وحدة) · Playwright (E2E للمسارات الحرجة) — تعمل على مكدّس Supabase **محلي زائل** (لا تمسّ السحابي).

**Target Platform**: متصفّح حديث (واجهة إدارة داخلية)؛ خادم Node على VPS (Contabo) عبر Coolify/Dokploy.

**Project Type**: تطبيق ويب (Next.js full-stack: server + client) فوق قاعدة م٠.

**Performance Goals**: واجهة إدارة لفريق ٧–١٠ — لا أهداف حمل عالية؛ المعيار تجربة محرّر سلسة (حفظ <١ث للعمليات العادية).

**Constraints**: لا تغيير مخطط م٠ (SC-009) · المفتاح السري في الخادم فقط (SC-008) · كل كتابة تتطلّب aal2 · احترام RLS (لا تجاوز من العميل).

**Scale/Scope**: ٧–١٠ مستخدمين، عربي أصل (بنية متعددة اللغات جاهزة)، ~عشرات الشاشات/المسارات.

## Constitution Check

*GATE: يجب أن تمرّ قبل Phase 0. أُعيد فحصها بعد Phase 1.*

| المبدأ | البوابة في م١ | الحالة |
|--------|----------------|--------|
| I — ننقل فقط | الواجهة تفرض/تُظهر `grading_source` (قيد م٠ يبقى الحارس)؛ النصوص المقدّسة تُنقل لا تُؤلَّف | ✅ |
| II — لكل معلومة مصدر ودرجة | محرّر المعلومة يلزم استشهادًا معتمدًا + درجة (US2)؛ القيود الفعلية في م٠ | ✅ |
| III — بوابة المراجعة للجميع | الواجهة تعرض الانتقالات المسموحة فقط وتستدعي آلة حالات م٠؛ لا تجاوز عبر UI (US4) | ✅ |
| IV — التدقيق الشامل | كل كتابة تمرّ بقاعدة م٠ فتُلتقط بـ trigger التدقيق؛ لا مسار يتجاوزه | ✅ |
| V — متعدد اللغات | محرّر/حالة لكل لغة؛ قاعدة الظهور (الهيكل+الترجمة published) | ✅ |
| VI — صون البيانات | حذف ناعم عبر UI؛ **قفل تفاؤلي** لمنع الكتابة فوق الأحدث؛ لا حذف فيزيائي | ✅ |
| VII — spec-first/test-first | سير speckit متّبع؛ TDD مُكيَّف للواجهة (Vitest/Playwright، اختبار-أولًا للمنطق الحرج) | ✅ |
| VIII — الأمان/الأدوار/2FA | aal2 إلزامي لكل كتابة؛ أقل امتياز عبر RLS؛ service role في الخادم فقط؛ تسجيل/إعادة تعيين 2FA | ✅ |
| **SC-009 — لا تغيير مخطط** | التصميم لا يحتاج DDL (رموز احتياطية في auth metadata، قفل عبر updated_at القائم) | ✅ |

**حوكمة (مُعالَجة):** عُدّل الدستور إلى **1.1.0** (2026-06-22) فصار سطر النطاق دائمًا ("المرحلة المُعتمدة حسب المواصفة النشطة وإذن المالك — حاليًا م١"). فلا تعارض.

**الرموز الاحتياطية (مُعتمَد):** تُخزَّن مجزّأةً في `auth.users` app_metadata (بيانات لا DDL، يحترم SC-009) — **قرار المالك 2026-06-22**. لا جدول مخصّص ولا فتح لمخطط م٠.

## Project Structure

### Documentation (this feature)

```text
specs/002-m1-authoring-tool/
├── plan.md              # هذا الملف
├── research.md          # Phase 0 — قرارات تقنية
├── data-model.md        # Phase 1 — يشير لمخطط م٠ القائم (بلا تغيير) + عقدة claim_ref + القفل
├── quickstart.md        # Phase 1 — دليل التشغيل/التحقّق
├── contracts/           # Phase 1 — عقود عمليات الخادم + عقدة claim_ref + القفل التفاؤلي
└── tasks.md             # Phase 2 (speckit-tasks لاحقًا — ليس الآن)
```

### Source Code (repository root)

```text
app/                          # Next.js App Router
├── (auth)/                   # تسجيل الدخول + تدفّق 2FA (تسجيل/تحقّق/استعادة)
│   ├── login/
│   └── mfa/                  # enroll · challenge · recovery
├── (admin)/                  # مسارات محمية (تتطلّب aal2)
│   ├── claims/               # محرّر المعلومة المفردة
│   ├── entities/             # حدث/شخص/مكان + السرد الغني (TipTap)
│   ├── sources/              # اقتراح/اعتماد المصادر
│   ├── review/               # لوحة سير المراجعة
│   └── admin/                # إدارة المستخدمين + إعادة تعيين 2FA (مدير)
├── layout.tsx                # RTL + عربي (dir="rtl", lang="ar")
└── api/ or actions/          # عمليات الخادم (server actions / route handlers)

lib/
├── supabase/
│   ├── client.ts             # متصفّح: anon key + جلسة المستخدم (RLS)
│   ├── server.ts             # خادم: anon key + كوكيز الجلسة (@supabase/ssr)
│   └── admin.ts              # خادم فقط: service role (إدارة محدودة) — لا يُستورد في العميل
├── editor/                   # TipTap: عقدة claim_ref + اشتقاق الترقيم + الهايلايت
├── data/                     # طبقة وصول البيانات (تحترم RLS)
└── auth/                     # مساعدات aal2 + الرموز الاحتياطية

tests/
├── unit/                     # Vitest + RTL
└── e2e/                      # Playwright (دخول/2FA/تحرير معلومة/انتقال مراجعة)
```

**Structure Decision**: تطبيق Next.js أحادي (full-stack) تحت جذر المستودع، يستهلك قاعدة م٠ في `supabase/`. حدود واضحة: `lib/supabase/admin.ts` (service role) **خادم فقط**؛ بقية الوصول بجلسة المستخدم. الواجهة كلها تحت `app/` بمجموعتي مسارات: `(auth)` عامة، `(admin)` محمية بـ aal2.

## Complexity Tracking

> لا انتهاكات دستورية تستوجب تبريرًا. التصميم يلتزم "لا تغيير مخطط" والأمان وأقل امتياز. النقطتان أعلاه (تعديل الدستور لنطاق م١، تأكيد تخزين الرموز الاحتياطية) **قرارا مالك** لا انتهاكا تعقيد.
