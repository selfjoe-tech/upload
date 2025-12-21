import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";

function extFromName(name: string) {
  const i = name.lastIndexOf(".");
  const ext = i >= 0 ? name.slice(i + 1).toLowerCase() : "";
  return ext.replace(/[^a-z0-9]/g, "");
}

export async function POST(req: Request) {
  try {
    const ownerId = "f1f543a4-1280-447b-be7e-4d3e059c6c0b";
    const { kind, filename } = (await req.json()) as { kind: "video" | "image"; filename: string };

    const bucket = "media";
    const id = crypto.randomUUID();
    const folder = kind === "video" ? "videos" : "images";
    const ext = kind === "video" ? "mp4" : (extFromName(filename) || "jpg");
    const storagePath = `${folder}/${ownerId}/${id}.${ext}`;

    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath, { upsert: false });

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed to sign upload" }, { status: 400 });
    }

    const projectRef = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];

    return NextResponse.json({
      bucket,
      path: storagePath,
      token: data.token,
      projectRef,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unauthorized" }, { status: 401 });
  }
}
