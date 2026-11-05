"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Return null for expired/missing sessions so the client can render a useful
 * error instead of Next.js hiding a thrown server action exception in production.
 */
export async function requireUserIdFromCookies(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn("[upload] Supabase session validation failed:", error.message);
      return null;
    }
    return data.user?.id ?? null;
  } catch (error) {
    console.error("[upload] Unable to validate Supabase session", error);
    return null;
  }
}
