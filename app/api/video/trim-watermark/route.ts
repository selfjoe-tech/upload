import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

export const runtime = "nodejs";

type Body = {
  stagingVideoPath: string; // in uploads-staging bucket
  stagingWmPath: string;    // in uploads-staging bucket
  startSec: number;
  endSec: number;
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";

  audience: "straight" | "gay" | "trans" | "bisexual" | "lesbian" | "animated";
  title?: string | null;
  description?: string | null;
  tags?: string[];
};

function getOverlay(pos: NonNullable<Body["position"]>) {
  switch (pos) {
    case "top-left": return "overlay=16:16";
    case "top-right": return "overlay=W-w-16:16";
    case "bottom-left": return "overlay=16:H-h-16";
    case "bottom-right":
    default: return "overlay=W-w-16:H-h-16";
  }
}

async function runFfmpeg(args: string[]) {
  if (!ffmpegPath) throw new Error("ffmpeg-static did not provide a binary path");

  await new Promise<void>((resolve, reject) => {
    const p = spawn(ffmpegPath as string, args, { stdio: "inherit" });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });
}

export async function POST(req: Request) {
  try {
    // 1) Read identity from cookies (NO auth headers, NO getUser)
    const store = await cookies();
    const userId = store.get("userId")?.value ?? null;
    const username = store.get("username")?.value ?? null;
    const isLoggedIn = store.get("isLoggedIn")?.value ?? null;

    if (!isLoggedIn || !userId) {
      return NextResponse.json({ error: "Not logged in" }, { status: 401 });
    }

    // optional: basic sanity (avoid path injection / weirdness)
    if (!/^[a-zA-Z0-9\-]{10,}$/.test(userId)) {
      return NextResponse.json({ error: "Invalid userId cookie" }, { status: 400 });
    }

    const body = (await req.json()) as Body;

    const {
      stagingVideoPath,
      stagingWmPath,
      startSec,
      endSec,
      position = "bottom-right",
      audience,
      title,
      description,
      tags = [],
    } = body;

    if (!stagingVideoPath || !stagingWmPath) {
      return NextResponse.json({ error: "Missing staging paths" }, { status: 400 });
    }

    // 2) Security check (cookie-based): ensure staging paths are inside user's folder
    // Use whatever convention you use. This assumes:
    // uploads-staging/videos/<userId>/...
    // uploads-staging/wm/<userId>/...
    const mustContain = `/${userId}/`;
    if (!stagingVideoPath.includes(mustContain) || !stagingWmPath.includes(mustContain)) {
      return NextResponse.json({ error: "Staging paths do not belong to this user" }, { status: 403 });
    }

    const start = Math.max(0, Number(startSec || 0));
    const end = Math.max(start, Number(endSec || 0));
    const dur = Math.max(0.01, end - start);

    // 3) Supabase admin client (service role)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
    }

    const supaAdmin = createClient(supabaseUrl, serviceRole, {
      auth: { persistSession: false },
    });

    // 4) Download staging files (uploads-staging is public, but service role is fine)
    const dlVideo = await supaAdmin.storage.from("uploads-staging").download(stagingVideoPath);
    if (dlVideo.error || !dlVideo.data) {
      return NextResponse.json({ error: "Failed to download staging video" }, { status: 500 });
    }

    const dlWm = await supaAdmin.storage.from("uploads-staging").download(stagingWmPath);
    if (dlWm.error || !dlWm.data) {
      return NextResponse.json({ error: "Failed to download staging watermark" }, { status: 500 });
    }

    const videoBuf = Buffer.from(await dlVideo.data.arrayBuffer());
    const wmBuf = Buffer.from(await dlWm.data.arrayBuffer());

    // 5) Temp files
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "uc-ffmpeg-"));
    const inVideo = path.join(tmpDir, "input.mp4");
    const wmPng = path.join(tmpDir, "wm.png");
    const outVideo = path.join(tmpDir, "output.mp4");

    fs.writeFileSync(inVideo, videoBuf);
    fs.writeFileSync(wmPng, wmBuf);

    // 6) FFMPEG trim + overlay
    const overlay = getOverlay(position);

    await runFfmpeg([
      "-y",
      "-ss", start.toFixed(3),
      "-t", dur.toFixed(3),
      "-i", inVideo,
      "-i", wmPng,
      "-filter_complex", `[0:v]scale=-2:720,fps=30[v0];[v0][1:v]${overlay}[vout]`,
      "-map", "[vout]",
      "-map", "0:a?",
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-crf", "32",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      outVideo,
    ]);

    const outBuf = fs.readFileSync(outVideo);

    // 7) Upload output into media bucket
    const outPath = `videos/${userId}/${crypto.randomUUID()}.mp4`;

    const up = await supaAdmin.storage.from("media").upload(outPath, outBuf, {
      contentType: "video/mp4",
      upsert: false,
      cacheControl: "3600",
    });

    if (up.error) {
      return NextResponse.json({ error: "Failed to upload processed video to media" }, { status: 500 });
    }

    // 8) Insert DB row
    const ins = await supaAdmin
      .from("media")
      .insert({
        owner_id: userId,
        media_type: "video",
        audience,
        title: title ?? null,
        description: description ?? null,
        storage_path: outPath,
        duration_seconds: dur,
        tags,
        // optionally store watermark username you used:
        // watermark_username: username ?? null,
      })
      .select("id, storage_path")
      .single();

    if (ins.error) {
      return NextResponse.json({ error: "Failed to insert media row" }, { status: 500 });
    }

    // 9) Delete staging files + temp dir
    await supaAdmin.storage.from("uploads-staging").remove([stagingVideoPath, stagingWmPath]).catch(() => {});
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}

    return NextResponse.json({ row: ins.data }, { status: 200 });
  } catch (err: any) {
    console.error("trim-watermark error:", err);
    return NextResponse.json({ error: err?.message ?? "Server error" }, { status: 500 });
  }
}
