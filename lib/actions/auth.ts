"use server";

import { cookies } from "next/headers";
import { supabase } from "../supabaseClient";


export async function getUserProfileFromCookies(): Promise<{
  username: string | null;
  avatarUrl: string | null;
  isLoggedIn: string | null;
}> {
  const store = await cookies();

  const username = store.get("username")?.value ?? null;
  const avatarPath = store.get("avatar")?.value ?? null;
  const isLoggedIn = store.get("isLoggedIn")?.value ?? null;


  let avatarUrl: string | null = null;

  if (avatarPath) {
    const { data } = supabase.storage
      .from("media")
      .getPublicUrl(avatarPath);
    avatarUrl = data.publicUrl || null;
  }

  return { username, avatarUrl, isLoggedIn };
}

export async function getUserProfile(): Promise<{
  username: string | null;
  avatarUrl: string | null;
  isLoggedIn: string | null;
}> {
  

  let avatarUrl: string | null = null;

  if (avatarPath) {
    const { data } = supabase.storage
      .from("media")
      .getPublicUrl(avatarPath);
    avatarUrl = data.publicUrl || null;
  }

  return { username, avatarUrl, isLoggedIn };
}
