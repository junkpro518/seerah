import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { assertAal2, Aal2RequiredError } from "@/lib/auth/assertAal2";
import { getCurrentRole, isAdminRole } from "@/lib/auth/roles";

/**
 * هيكل واجهة الإدارة (T014) + حارس aal2 (T011).
 *
 * حارس مستوى-التخطيط = بداية الفرض لا نهايته: تخطيطات Next لا تُعاد دائمًا عند التنقّل
 * بين الأشقّاء، لذا الفرض الكامل عبر middleware + كل مسار كتابة يأتي في الطور ٣ (T022)،
 * والحارس الفعلي يبقى RLS م٠ (is_aal2).
 */
const STAFF_NAV = [
  { href: "/claims", label: "المعلومات" },
  { href: "/entities", label: "السرد" },
  { href: "/sources", label: "المصادر" },
  { href: "/review", label: "المراجعة" },
];

const ADMIN_NAV = [
  { href: "/admin", label: "الإدارة" },
];

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  try {
    await assertAal2(supabase);
  } catch (e) {
    if (e instanceof Aal2RequiredError) redirect("/mfa"); // مسجّل لكنه aal1 → خطوة التحقّق
    throw e;
  }

  const role = await getCurrentRole(supabase);
  if (!role) redirect("/login");

  const nav = isAdminRole(role) ? [...STAFF_NAV, ...ADMIN_NAV] : STAFF_NAV;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b">
        <nav className="flex items-center gap-4 p-4">
          <span className="font-bold">موسوعة السيرة</span>
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="text-sm hover:underline">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
