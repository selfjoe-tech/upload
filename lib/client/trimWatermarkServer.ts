"use client";

import { supabase } from "@/lib/supabaseClient";

export type AudienceType =
  | "straight"
  | "gay"
  | "trans"
  | "bisexual"
  | "lesbian"
  | "animated";

type ResultRow = { id: number; storage_path?: string | null };

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : null;
}

// Use your existing canvas watermark generator (same as before)
async function createWatermarkPngBytes(username: string, baseLogoUrl: string): Promise<Uint8Array> {
  const tag = username.startsWith("@") ? username : `@${username}`;

  const img = new Image();
  img.src = baseLogoUrl;
  img.crossOrigin = "anonymous";
  await img.decode();

  const paddingX = 10;
  const paddingY = 6;
  const gapLogoText = 4;
  const textHeight = 12;

  const width = img.width + paddingX * 2;
  const height = img.height + paddingY * 2 + gapLogoText + textHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D context");

  ctx.clearRect(0, 0, width, height);

  // transparent rounded rect
  const radius = 12;
  ctx.fillStyle = "rgba(255,255,255,0)";
  roundRect(ctx, 0, 0, width, height, radius);
  ctx.fill();

  const logoX = (width - img.width) / 2;
  const logoY = paddingY;
  ctx.drawImage(img, logoX, logoY);

  ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0)";
  ctx.shadowBlur = 4;

  const textY = logoY + img.height + gapLogoText + textHeight / 2;
  ctx.fillText(tag, width / 2, textY);

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const bin = atob(base64);

  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const min = Math.min(w, h) / 2;
  if (r > min) r = min;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export async function trimAndWatermarkVideoAndCreateRow(opts: {
  file: File;
  trim: { startSec: number; endSec: number };
  form: {
    audience: AudienceType;
    title?: string;
    description?: string;
    tags?: string[];
  };
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  logoUrl?: string;
  onProgress?: (pct: number) => void; // 0..100
}): Promise<ResultRow> {
  const { file, trim, form, position = "bottom-right", logoUrl = "/watermark-1.png", onProgress } = opts;

  if (!file) throw new Error("No file selected");

  // Read userId + username from cookies (you asked for cookie-based)
  const userId = readCookie("userId");
  const username = readCookie("username") || "upskirtcandy";
  const isLoggedIn = readCookie("isLoggedIn");

  if (!isLoggedIn || !userId) throw new Error("Not logged in");

  onProgress?.(5);

  // staging paths that match the server’s “must contain /<userId>/” check
  const stagingVideoPath = `videos/${userId}/${crypto.randomUUID()}.mp4`;
  const stagingWmPath = `wm/${userId}/${crypto.randomUUID()}.png`;

  // 1) Upload original video to uploads-staging
  const upVid = await supabase.storage.from("uploads-staging").upload(stagingVideoPath, file, {
    upsert: false,
    cacheControl: "3600",
    contentType: file.type || "video/mp4",
  });
  if (upVid.error) throw new Error(upVid.error.message);

  onProgress?.(25);

  // 2) Create + upload watermark PNG to uploads-staging
  const wmBytes = await createWatermarkPngBytes(username, logoUrl);
  const wmBlob = new Blob([wmBytes], { type: "image/png" });

  const upWm = await supabase.storage.from("uploads-staging").upload(stagingWmPath, wmBlob, {
    upsert: false,
    cacheControl: "3600",
    contentType: "image/png",
  });
  if (upWm.error) throw new Error(upWm.error.message);

  onProgress?.(40);

  // 3) Call server route (NO auth headers)
  const res = await fetch("/api/video/trim-watermark", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      stagingVideoPath,
      stagingWmPath,
      startSec: trim.startSec,
      endSec: trim.endSec,
      position,
      audience: form.audience,
      title: form.title ?? null,
      description: form.description ?? null,
      tags: form.tags ?? [],
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt || "Server processing failed");
  }

  onProgress?.(95);

  const data = (await res.json()) as { row: ResultRow };
  onProgress?.(100);
  return data.row;
}
