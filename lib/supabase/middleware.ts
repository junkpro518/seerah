import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * تحديث جلسة @supabase/ssr على كل طلب + إعادة توجيه غير المسجّلين عن المسارات المحمية.
 *
 * النمط القانوني: لا كود بين createServerClient و getUser()، وتُعاد supabaseResponse
 * بكوكيزها سليمة. **فرض aal2 ليس هنا** (التخطيط + RLS) — هذا حارس وجود-جلسة فقط (UX).
 * المسارات العامة تشمل /mfa/recovery لأنها بطبيعتها تُستخدَم على aal1.
 */
const PUBLIC_PATHS = ["/login", "/mfa"];

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options?: Record<string, unknown>;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // لا تُدرج أي كود بين السطر أعلاه و getUser() (يكسر تحديث الجلسة).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
