"use server";

import { createClient } from "@/lib/supabase/server";

export async function getUserProfileFromCookies(): Promise<{
  username: string | null;
  avatarUrl: string | null;
  isLoggedIn: string | null;
}> {
  try {
    const supabase = await createClient();
    const { data: auth, error } = await supabase.auth.getUser();
    if (error || !auth.user) {
      return { username: null, avatarUrl: null, isLoggedIn: null };
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("username, avatar_url")
      .eq("id", auth.user.id)
      .maybeSingle();
    return {
      username: profile?.username ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      isLoggedIn: "true",
    };
  } catch (error) {
    console.warn("[upload] Could not load current profile", error);
    return { username: null, avatarUrl: null, isLoggedIn: null };
  }
}
