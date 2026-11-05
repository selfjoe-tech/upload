/**
 * Supabase Auth cookies are shared with the main Goon Gram site only when
 * served from an owned production hostname. Keep Vercel previews/localhost
 * host-only to avoid invalid Domain attributes.
 */
export function authCookieOptions(hostname?: string | null) {
  const host = (hostname ?? "").split(":")[0].toLowerCase();
  const share = host === "goongram.com" || host.endsWith(".goongram.com");
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    ...(share ? { domain: "goongram.com" } : {}),
  };
}
