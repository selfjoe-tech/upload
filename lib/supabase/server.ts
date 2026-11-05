import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { authCookieOptions } from "@/lib/supabase/authCookieOptions";

// Instantiate per request; never trust old userId/isLoggedIn cookies for identity.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase connection settings.");
  const store = await cookies();
  const hostname = (await headers()).get("host");

  return createServerClient(url, key, {
    cookieOptions: authCookieOptions(hostname),
    cookies: {
      getAll() { return store.getAll(); },
      setAll(entries) {
        try {
          entries.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components are read-only; the upload proxy refreshes cookies.
        }
      },
    },
  });
}
