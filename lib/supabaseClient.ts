import { authCookieOptions } from "@/lib/supabase/authCookieOptions";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Use the same Supabase Auth cookie storage as goongram.com, not a separate
// upload.goongram.com localStorage session.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.");

let instance: SupabaseClient | undefined;

export function createClient(): SupabaseClient {
  if (!instance) {
    instance = createBrowserClient(url!, key!, {
      cookieOptions: authCookieOptions(typeof window === "undefined" ? undefined : window.location.hostname),
    });
  }
  return instance;
}

export const supabase = createClient();
