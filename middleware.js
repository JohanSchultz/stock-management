import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { isMenuPathAllowed, isProtectedMenuPath } from "@/lib/menu/routePermissions";

const PUBLIC_PATH_PREFIXES = ["/login", "/auth", "/reset-password"];

function isPublicPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export async function middleware(request) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;
  const pathname = request.nextUrl.pathname;

  if (!user && !isPublicPath(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isProtectedMenuPath(pathname)) {
    const { data: permissions, error } = await supabase.rpc(
      "get_permissions_by_user"
    );

    if (error || !isMenuPathAllowed(pathname, permissions)) {
      const url = request.nextUrl.clone();
      url.pathname = "/menu-dynamic";
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
