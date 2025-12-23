// upload-site/lib/client/watermarkVideo.ts
"use client";

import type { FFmpeg } from "@ffmpeg/ffmpeg";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

const WM_BYTES_CACHE = new Map<string, Uint8Array>();

async function getWatermarkBytes(username: string, logoUrl: string) {
  const key = `${logoUrl}::${username.trim().toLowerCase()}`;
  const hit = WM_BYTES_CACHE.get(key);
  if (hit) return hit;

  const bytes = await createWatermarkPngBytes(username.trim(), logoUrl);
  WM_BYTES_CACHE.set(key, bytes);
  return bytes;
}

export type WatermarkPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoading: Promise<FFmpeg> | null = null;

async function getFfmpeg(onProgress?: (ratio: number) => void): Promise<FFmpeg> {
  if (ffmpegInstance) {
    if (onProgress && (ffmpegInstance as any).setProgress) {
      (ffmpegInstance as any).setProgress(({ ratio }: { ratio: number }) =>
        onProgress(ratio)
      );
    }
    return ffmpegInstance;
  }

  if (!ffmpegLoading) {
    const ff = createFFmpeg({ log: false });

    ffmpegLoading = (async () => {
      if (!ff.isLoaded()) await ff.load();
      if (onProgress && (ff as any).setProgress) {
        (ff as any).setProgress(({ ratio }: { ratio: number }) => onProgress(ratio));
      }
      ffmpegInstance = ff as any;
      return ff as any;
    })();
  }

  return ffmpegLoading;
}

// ---- your canvas watermark png generator (same) ----
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

  const radius = 12;
  ctx.fillStyle = "rgba(255, 255, 255, 0)";
  roundRect(ctx, 0, 0, width, height, radius);
  ctx.fill();

  const logoX = (width - img.width) / 2;
  const logoY = paddingY;
  ctx.drawImage(img, logoX, logoY);

  ctx.font = "bold 18px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0, 0, 0, 0)";
  ctx.shadowBlur = 4;

  const textY = logoY + img.height + gapLogoText + textHeight / 2;
  ctx.fillText(tag, width / 2, textY);

  const dataUrl = canvas.toDataURL("image/png");
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
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

function getOverlayFilter(pos: WatermarkPosition) {
  switch (pos) {
    case "top-left": return "overlay=16:16";
    case "top-right": return "overlay=W-w-16:16";
    case "bottom-left": return "overlay=16:H-h-16";
    case "bottom-right":
    default: return "overlay=W-w-16:H-h-16";
  }
}

export async function watermarkVideoFile(
  file: File,
  username: string,
  opts?: {
    position?: WatermarkPosition;
    logoUrl?: string;
    onProgress?: (ratio: number) => void;
  }
): Promise<File> {
  const ffmpeg = await getFfmpeg(opts?.onProgress);
  const position = opts?.position ?? "top-left";
  const logoUrl = opts?.logoUrl ?? "/watermark-1.png";

  ["input.mp4", "wm.png", "output.mp4"].forEach((n) => {
    try { (ffmpeg as any).FS("unlink", n); } catch {}
  });

  (ffmpeg as any).FS("writeFile", "input.mp4", await fetchFile(file));
  (ffmpeg as any).FS("writeFile", "wm.png", await getWatermarkBytes(username, logoUrl));

  const overlay = getOverlayFilter(position);

  await (ffmpeg as any).run(
    "-i", "input.mp4",
    "-i", "wm.png",
    "-filter_complex", `[0:v]scale=-2:720,fps=30[v0];[v0][1:v]${overlay}[vout]`,
    "-map", "[vout]",
    "-map", "0:a?",
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "32",
    "-c:a", "aac",
    "-b:a", "128k",
    "output.mp4"
  );

  const data = (ffmpeg as any).FS("readFile", "output.mp4") as Uint8Array;

  try { (ffmpeg as any).FS("unlink", "input.mp4"); } catch {}
  try { (ffmpeg as any).FS("unlink", "wm.png"); } catch {}
  try { (ffmpeg as any).FS("unlink", "output.mp4"); } catch {}


  const outName =
    file.name.replace(/\.[^.]+$/, "") + "-wm" + (file.name.match(/\.[^.]+$/) ?? [".mp4"])[0];

const bytes = data.byteOffset === 0 && data.byteLength === data.buffer.byteLength
  ? data.buffer
  : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);

return new File([bytes], outName, { type: "video/mp4" });




}


