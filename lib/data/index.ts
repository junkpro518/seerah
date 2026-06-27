/**
 * طبقة وصول البيانات (م١) — القاعدة الناظمة:
 *
 *  1. كل قراءة/كتابة تمرّ بـ **جلسة المستخدم** (anon key) عبر `lib/supabase/server.ts`
 *     أو `client.ts`. **RLS م٠ هو الحارس الفعلي** — لا تجاوز من التطبيق.
 *  2. **ممنوع** استيراد `lib/supabase/admin.ts` (service role) في هذه الطبقة؛ الإدارة
 *     المحدودة (إعادة تعيين 2FA، إنشاء حسابات) تبقى في server actions مخصّصة (SC-008).
 *  3. كل تعديل يستخدم `updateWithOptimisticLock` (قفل تفاؤلي عبر updated_at) — بعد
 *     إثبات صلاحية الكتابة (assertAal2 + is_staff).
 *  4. صفر تغيير مخطط (SC-009): كل الكتابة داخل أعمدة م٠ القائمة.
 *
 * دوال الوصول الخاصة بالكيانات (claims/sources/translations/transitions) تُضاف ضمن
 * أطوار القصص (US2..US6)، لا هنا.
 */
export { updateWithOptimisticLock } from "./optimistic";
export type { OptimisticResult } from "./optimistic";
