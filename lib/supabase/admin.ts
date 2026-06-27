import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * عميل الإدارة: مفتاح service role — يتجاوز RLS. خادم فقط (SC-008).
 *
 * استيراد "server-only" أعلاه يجعل البناء يفشل إن حاول أي Client Component
 * استيراد هذا الملف، فلا يدخل المفتاح حزمة المتصفح أبدًا.
 *
 * يُستخدم حصرًا في server actions/route handlers لعمليات الإدارة المحدودة
 * (إعادة تعيين 2FA، إنشاء الحسابات، تخزين الرموز الاحتياطية المجزّأة).
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
