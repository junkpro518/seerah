"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * عميل المتصفّح: مفتاح anon + جلسة المستخدم. RLS هو الحارس الفعلي.
 * لا يُستخدم هنا أي مفتاح service role إطلاقًا (SC-008).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
