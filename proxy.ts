import { authCookieOptions } from "@/lib/supabase/authCookieOptions";
import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookieOptions: authCookieOptions(request.nextUrl.hostname),
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(entries) {
        entries.forEach(({name,value}) => request.cookies.set(name,value));
        response = NextResponse.next({ request });
        entries.forEach(({name,value,options}) => response.cookies.set(name,value,options));
      },
    },
  });
  // Refresh expiring JWTs before server actions run.
  await supabase.auth.getClaims();
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)"],
};
