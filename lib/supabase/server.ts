import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * عميل الخادم: مفتاح anon + كوكيز جلسة المستخدم (@supabase/ssr).
 * Server Components/Actions تقرأ وتكتب بجلسة المستخدم — RLS يفرض الصلاحيات.
 * لا service role هنا (ذاك في admin.ts الخادمي فقط — SC-008).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // استدعاء من Server Component — تُضبط الكوكيز عبر middleware/الإجراء.
          }
        },
      },
    },
  );
}
