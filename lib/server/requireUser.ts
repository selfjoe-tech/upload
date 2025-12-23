"use server";

import { cookies } from "next/headers";
import { supabasePublic as supabase } from "@/lib/supabase/public";

export async function requireUserIdFromCookies(): Promise<string> {
  const store = await cookies();

  const userId = store.get("userId")?.value ?? null;
  const isLoggedIn = store.get("isLoggedIn")?.value === "true";

  if (!userId || !isLoggedIn) {
    throw new Error("Unauthorized");
  }

  // Optional sanity check: confirm profile exists
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) throw new Error("Unauthorized");

  return userId;
}


export async function requireUserNameFromCookies(): Promise<string | null> {
  const store = await cookies();

  const username = store.get("username")?.value ?? null;
  // Optional sanity check: confirm profile exists
  
  return username;
}