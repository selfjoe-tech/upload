import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    path: string;
    audience: string;
    title?: string;
    description?: string;
    tags?: string[];
    width?: number | null;
    height?: number | null;
  };

  const supabase = await supabaseServer();
  const id = "f1f543a4-1280-447b-be7e-4d3e059c6c0b";
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tags = Array.isArray(body.tags) ? body.tags.slice(0, 10) : [];

  const { data, error } = await supabase
    .from("media")
    .insert({
      owner_id: id,
      media_type: "image",
      audience: body.audience,
      title: body.title ?? null,
      description: body.description ?? null,
      storage_path: body.path,
      duration_seconds: null,
      width: typeof body.width === "number" ? body.width : null,
      height: typeof body.height === "number" ? body.height : null,
      tags,
    })
    .select("id, storage_path")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ row: data });
}
