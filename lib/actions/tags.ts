// lib/actions/tags.ts
// No "use client" / "use server" here so it can be imported by client components too.

import { supabase } from "@/lib/supabaseClient"; 
import { toTitleCase, slugify } from "@/lib/utils/text";

// ^ adjust this import to however you create your supabase client.
// e.g. `import { createClient } from "@/lib/supabase/client"; const supabase = createClient();`



/**
 * Fetch up to `limit` tag labels for suggestions.
 * If there are fewer than `limit` tags in DB, Supabase just returns them all.
 */
export async function fetchInitialTagSuggestions(
  limit = 50
): Promise<string[]> {
  const { data, error } = await supabase
    .from("tags")
    .select("label")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("fetchInitialTagSuggestions error", error);
    return [];
  }

  const labels =
    data
      ?.map((row) => (row.label as string | null)?.trim())
      .filter((v): v is string => !!v) ?? [];

  // Deduplicate + normalize to Title Case
  const unique: string[] = [];
  for (const l of labels) {
    const t = toTitleCase(l);
    if (!unique.includes(t)) unique.push(t);
  }
  return unique;
}

/**
 * Search tags by label using ILIKE and return up to `limit` results.
 * When `query` is empty, just fall back to the initial suggestions.
 */
export async function searchTagSuggestions(
  query: string,
  limit = 50
): Promise<string[]> {
  const q = query.trim();

  if (!q) {
    return fetchInitialTagSuggestions(limit);
  }

  const { data, error } = await supabase
    .from("tags")
    .select("label")
    .ilike("label", `%${q}%`)
    .order("label", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("searchTagSuggestions error", error);
    return [];
  }

  const labels =
    data
      ?.map((row) => (row.label as string | null)?.trim())
      .filter((v): v is string => !!v) ?? [];

  const unique: string[] = [];
  for (const l of labels) {
    const t = toTitleCase(l);
    if (!unique.includes(t)) unique.push(t);
  }
  return unique;
}

// Export the helper if you ever want reuse for local transforms
export { toTitleCase };


export async function ensureTagAction(input: { label: string; slug?: string }) {

  const label = toTitleCase(input.label);
  const slug = slugify(label);

  // 1) check if exists
  const existing = await supabase
    .from("tags")
    .select("label, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (existing.error) {
    return { success: false as const, message: existing.error.message };
  }
  if (existing.data) {
    return { success: true as const, tag: existing.data };
  }

  // 2) insert if missing (handle race by re-selecting on conflict)
  const inserted = await supabase
    .from("tags")
    .insert({ label, slug })
    .select("label, slug")
    .single();

  if (!inserted.error) {
    return { success: true as const, tag: inserted.data };
  }

  // If another request inserted first, re-fetch
  const retry = await supabase
    .from("tags")
    .select("label, slug")
    .eq("slug", slug)
    .maybeSingle();

  if (retry.data) return { success: true as const, tag: retry.data };

  return { success: false as const, message: inserted.error.message };
}