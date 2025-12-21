// components/upload/VideoTrimEditor.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2 } from "lucide-react";

const CLIP_MAX_SECONDS = 60;
const CLIP_MIN_SECONDS = 5;
const FAST_FIRST = 8;
const TARGET_TOTAL = 12;
const CANVAS_W = 160;
const CANVAS_H = 90;
const ACCENT = "pink";

type Props = {
  file: File;
  src: string; // ← use parent-provided blob URL
  onBack: () => void;
  onNext: (clip: { start: number; end: number; muted: boolean; file: File }) => void;
};

export default function VideoTrimEditor({ file, src, onBack, onNext }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(true);

  // selection (seconds)
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);

  // loading flags
  const [metaReady, setMetaReady] = useState(false);
  const [thumbsReady, setThumbsReady] = useState(false);
  const preparing = !metaReady;

  // thumbs
  const [thumbs, setThumbs] = useState<string[]>([]);

  /** Metadata + start playback ASAP (robust) */
  useEffect(() => {
    setMetaReady(false);
    setThumbsReady(false);
    setThumbs([]);
    setStart(0);
    setEnd(0);

    const v = videoRef.current;
    if (!v) return;

    const onMeta = () => {
      const dur = v.duration || 0;
      setDuration(dur);
      const win = Math.min(CLIP_MAX_SECONDS, dur || CLIP_MAX_SECONDS);
      setStart(0);
      setEnd(Math.min(win, dur || win));
      setMetaReady(true);

      v.currentTime = 0;
      v.muted = true;
      const tryPlay = () => v.play().catch(() => {});
      if (v.readyState >= 3) tryPlay();
      else v.addEventListener("canplay", tryPlay, { once: true });
    };

    v.load(); // ensure a fresh load for this src
    if (v.readyState >= 1) onMeta();
    else v.addEventListener("loadedmetadata", onMeta, { once: true });

    return () => {
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, [src]);

  /** Fast thumbnails (play-through first batch, lazy backfill) */
  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setThumbs([]);
      setThumbsReady(false);

      const helper = document.createElement("video");
      helper.src = src;
      (helper as any).muted = true;
      (helper as any).playsInline = true;
      helper.preload = "metadata";

      await waitEvent(helper, "loadedmetadata");
      const dur = Math.max(0.1, helper.duration || 0.1);

      const canvas = document.createElement("canvas");
      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;
      const ctx = canvas.getContext("2d")!;

      const capture = () => {
        ctx.drawImage(helper, 0, 0, CANVAS_W, CANVAS_H);
        const data = canvas.toDataURL("image/jpeg", 0.6);
        if (!cancelled) setThumbs((p) => [...p, data]);
      };

      const backfill = async (already: number) => {
        const step = dur / TARGET_TOTAL;
        for (let i = already; i < TARGET_TOTAL && !cancelled; i++) {
          const t = i * step;
          if ("fastSeek" in helper) (helper as any).fastSeek(t);
          else await seekTo(helper, t);
          capture();
          await new Promise((r) => setTimeout(r, 0));
        }
        if (!cancelled) setThumbsReady(true);
      };

      if ("requestVideoFrameCallback" in helper) {
        let grabbed = 0;
        const target = FAST_FIRST;
        const step = dur / target;
        let nextT = 0;

        helper.currentTime = 0;
        helper.playbackRate = 8;
        await helper.play().catch(() => {});

        // @ts-ignore
        const tick = (_now: any, meta: any) => {
          if (cancelled) return;
          const t = meta?.mediaTime ?? helper.currentTime;

          while (t >= nextT && grabbed < target) {
            helper.pause();
            helper.currentTime = nextT;
            capture();
            grabbed++;
            nextT += step;
          }

          if (grabbed < target) {
            helper.play().catch(() => {});
            // @ts-ignore
            helper.requestVideoFrameCallback(tick);
          } else {
            helper.pause();
            setThumbsReady(true);
            const idle = (window as any).requestIdleCallback || ((fn: any) => setTimeout(fn, 0));
            idle(() => backfill(grabbed));
          }
        };

        // @ts-ignore
        helper.requestVideoFrameCallback(tick);
      } else {
        const step = dur / FAST_FIRST;
        for (let i = 0; i < FAST_FIRST && !cancelled; i++) {
          const t = i * step;
          if ("fastSeek" in helper) (helper as any).fastSeek(t);
          else await seekTo(helper, t);
          capture();
          await new Promise((r) => setTimeout(r, 0));
        }
        setThumbsReady(true);
        const idle = (window as any).requestIdleCallback || ((fn: any) => setTimeout(fn, 0));
        idle(() => backfill(FAST_FIRST));
      }
    };

    run();
    return () => { cancelled = true; };
  }, [src]);

  /** Keep preview looped in [start, end] */
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (v.currentTime < start || v.currentTime > end) v.currentTime = start;
      if (v.currentTime >= end) v.currentTime = start;
    };
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [start, end]);

  // ===== selection UI =====
  const railRef = useRef<HTMLDivElement | null>(null);
  const [dragMode, setDragMode] = useState<null | "left" | "right" | "move">(null);
  const dragStartX = useRef(0);
  const dragStart = useRef({ start: 0, end: 0 });

  const pxToSec = (px: number) => {
    const rail = railRef.current;
    if (!rail || duration === 0) return 0;
    return (px / rail.clientWidth) * duration;
  };
  const secToPct = (sec: number) => (duration ? (sec / duration) * 100 : 0);

  const beginDrag = (e: React.PointerEvent, mode: "left" | "right" | "move") => {
    e.preventDefault();
    e.stopPropagation(); // critical: prevent bubbling to body
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragStartX.current = e.clientX;
    dragStart.current = { start, end };
    setDragMode(mode);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragMode) return;
    const dx = e.clientX - dragStartX.current;
    const dSec = pxToSec(dx);

    if (dragMode === "move") {
      let ns = clamp(dragStart.current.start + dSec, 0, duration);
      let ne = clamp(dragStart.current.end + dSec, 0, duration);
      const len = ne - ns;
      const min = CLIP_MIN_SECONDS;
      const max = Math.min(CLIP_MAX_SECONDS, duration);

      if (len < min) { const d = min - len; ns -= d / 2; ne += d / 2; }
      if (len > max) { const d = len - max; ns += d / 2; ne -= d / 2; }
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > duration) { ns -= ne - duration; ne = duration; }
      setStart(ns); setEnd(ne);
    } else if (dragMode === "left") {
      let ns = clamp(dragStart.current.start + dSec, 0, end - CLIP_MIN_SECONDS);
      const len = end - ns;
      const max = Math.min(CLIP_MAX_SECONDS, duration);
      if (len > max) ns = end - max;
      setStart(ns);
    } else if (dragMode === "right") {
      let ne = clamp(dragStart.current.end + dSec, start + CLIP_MIN_SECONDS, duration);
      const len = ne - start;
      const max = Math.min(CLIP_MAX_SECONDS, duration);
      if (len > max) ne = start + max;
      setEnd(ne);
    }
  };
  const endDrag = (e: React.PointerEvent) => {
    if (!dragMode) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    setDragMode(null);
  };

  const length = Math.max(0, end - start).toFixed(1);

  return (
    <div className="pb-6">
      <header className="sticky top-0 z-10 flex items-center justify-center h-14 bg-black/80 backdrop-blur border-b border-white/10">
        <button onClick={onBack} aria-label="Back" className="absolute left-3 rounded-full p-2 hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h2 className="text-lg font-semibold">Video Editor</h2>
      </header>

      <div className="mx-auto max-w-[960px] px-4 pt-4 space-y-5">
        {/* PREVIEW */}
        <div className="relative bg-[#191919] rounded-md p-3">
          <video
            key={src}
            ref={videoRef}
            src={src}
            className="w-full aspect-video bg-black rounded"
            muted={muted}
            playsInline
            preload="metadata"
            controls={false}
            autoPlay
          />
          {preparing && (
            <div className="absolute inset-3 rounded bg-black/60 grid place-items-center">
              <div className="flex items-center gap-2 text-white/90">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>Preparing preview…</span>
              </div>
            </div>
          )}
        </div>

        {/* THUMB RAIL */}
        <div
          ref={railRef}
          className="relative select-none touch-none bg-[#111] rounded-md p-2"
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {thumbsReady ? (
            <div className="grid grid-rows-1 grid-flow-col auto-cols-[minmax(80px,1fr)] gap-1 h-20 overflow-hidden rounded">
              {thumbs.map((src, i) => (
                <img key={i} src={src} alt="" className="h-20 w-full object-cover" />
              ))}
            </div>
          ) : (
            <div className="grid grid-rows-1 grid-flow-col auto-cols-[minmax(80px,1fr)] gap-1 h-20 overflow-hidden rounded">
              {Array.from({ length: FAST_FIRST }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full bg-white/10" />
              ))}
            </div>
          )}

          {/* selection overlay */}
          <div
            className="absolute top-2 bottom-2 border-2 rounded-md pointer-events-auto"
            style={{
              left: `${secToPct(start)}%`,
              width: `${secToPct(end - start)}%`,
              borderColor: "#fff",
              boxShadow: "0 0 0 2px rgba(0,0,0,.35) inset",
            }}
          >
            <div
              className="absolute inset-0 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => beginDrag(e, "move")}
            />
            <Handle side="left" onPointerDown={(e) => beginDrag(e, "left")} />
            <Handle side="right" onPointerDown={(e) => beginDrag(e, "right")} />
          </div>
        </div>

        {/* controls */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-base">Enable Sound</span>
            <Switch checked={!muted} onCheckedChange={(v) => setMuted(!v)} />
          </div>
          <div className="text-sm text-white/70">
            Clip length: <span className="font-semibold">{length}s</span>
          </div>
        </div>

        <Button
          onClick={() => onNext({ start, end, muted, file })}
          className="w-full h-14 rounded-full text-black font-semibold"
          style={{ backgroundColor: ACCENT }}
          disabled={preparing}
        >
          {preparing ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Processing…
            </span>
          ) : (
            "Next"
          )}
        </Button>
      </div>
    </div>
  );
}

/* =================== helpers =================== */

function Handle({
  side,
  onPointerDown,
}: {
  side: "left" | "right";
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const base =
    "absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white border border-black shadow cursor-ew-resize";
  return (
    <div
      role="slider"
      aria-orientation="horizontal"
      aria-label={`${side} trim handle`}
      className={`${base} ${side === "left" ? "-left-2" : "-right-2"}`}
      onPointerDown={onPointerDown}
      onDoubleClick={onPointerDown}
    />
  );
}

function waitEvent<T extends keyof HTMLMediaElementEventMap>(
  el: HTMLVideoElement,
  name: T
) {
  return new Promise<void>((res) => el.addEventListener(name, () => res(), { once: true }));
}

async function seekTo(video: HTMLVideoElement, time: number) {
  return new Promise<void>((res) => {
    const onSeek = () => {
      video.removeEventListener("seeked", onSeek);
      res();
    };
    video.addEventListener("seeked", onSeek, { once: true });
    if (video.readyState < 1) {
      video.addEventListener("loadeddata", () => (video.currentTime = time), { once: true });
    } else {
      video.currentTime = Math.max(0, Math.min(video.duration || 0, time));
    }
  });
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
