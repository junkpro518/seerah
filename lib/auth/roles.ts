import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * أدوار م٠ (جدول roles): الموظّفون الأربعة. (data-model / 0002_lookups, 0015_rls.)
 * هذه معينات تجربة-مستخدم تعكس RLS م٠ (is_staff/is_admin)؛ الفرض الفعلي في القاعدة.
 */
export const STAFF_ROLES = [
  "author",
  "shariah_reviewer",
  "editor",
  "admin",
] as const;

export type Role = (typeof STAFF_ROLES)[number];

export function isStaffRole(role: string | null | undefined): role is Role {
  return role != null && (STAFF_ROLES as readonly string[]).includes(role);
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin";
}

/**
 * يقرأ دور المستخدم الحالي عبر جلسته (anon key + RLS) — ملفّه الشخصي فقط
 * (سياسة profiles: self-or-admin). لا service role، لا تجاوز.
 */
export async function getCurrentRole(client: SupabaseClient): Promise<Role | null> {
  const { data: userData } = await client.auth.getUser();
  const uid = userData?.user?.id;
  if (!uid) return null;

  const { data, error } = await client
    .from("profiles")
    .select("role_code")
    .eq("id", uid)
    .single();

  if (error || !data) return null;
  const role = (data as { role_code?: string }).role_code;
  return isStaffRole(role) ? role : null;
}
