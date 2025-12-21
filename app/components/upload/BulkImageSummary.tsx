"use client";

import * as React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, Check } from "lucide-react";

const ACCENT = "pink";

type UploadFn = (file: File, onProgress: (p: number) => void) => Promise<string>;

type Props = {
  files: File[];
  onBack: () => void;
  /** Provide your backend uploader. If omitted, uses a local mock with progress. */
  uploadFn?: UploadFn;
};

type Item = {
  file: File;
  previewUrl: string;
  status: "queued" | "uploading" | "done" | "error";
  progress: number;              // 0–100
  remoteUrl?: string;
  error?: string;
};

export default function BulkImageSummary({ files, onBack, uploadFn }: Props) {
  const [items, setItems] = React.useState<Item[]>([]);
  const [allDone, setAllDone] = React.useState(false);

  // build previews
  React.useEffect(() => {
    const built = files.map((f) => ({
      file: f,
      previewUrl: URL.createObjectURL(f),
      status: "queued" as const,
      progress: 0,
    }));
    setItems(built);

    return () => built.forEach((i) => URL.revokeObjectURL(i.previewUrl));
  }, [files]);

  // start uploads with small concurrency
  React.useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    const doUpload: UploadFn =
      uploadFn ??
      (async (file, onProgress) =>
        new Promise<string>((resolve) => {
          // local mock with progress
          const total = 800 + Math.random() * 900; // 0.8–1.7s
          let elapsed = 0;
          const iv = setInterval(() => {
            elapsed += 80;
            const pct = Math.min(100, Math.round((elapsed / total) * 100));
            onProgress(pct);
            if (pct >= 100) {
              clearInterval(iv);
              setTimeout(() => resolve(`mock://${file.name}`), 120);
            }
          }, 80);
        }));

    const concurrency = 3;
    let idx = 0;
    let active = 0;

    const next = () => {
      if (cancelled) return;
      while (active < concurrency && idx < items.length) {
        const cur = idx++;
        active++;
        runOne(cur).finally(() => {
          active--;
          if (!cancelled) next();
        });
      }
      if (active === 0 && idx >= items.length && !cancelled) {
        setAllDone(true);
      }
    };

    const runOne = async (i: number) => {
      setItems((s) =>
        s.map((it, k) => (k === i ? { ...it, status: "uploading", progress: 1 } : it))
      );
      try {
        const remote = await doUpload(items[i].file, (p) => {
          setItems((s) => s.map((it, k) => (k === i ? { ...it, progress: p } : it)));
        });
        setItems((s) =>
          s.map((it, k) => (k === i ? { ...it, status: "done", progress: 100, remoteUrl: remote } : it))
        );
      } catch (e: any) {
        setItems((s) =>
          s.map((it, k) => (k === i ? { ...it, status: "error", error: String(e?.message ?? e) } : it))
        );
      }
    };

    next();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, uploadFn]);

  return (
    <div className="mx-auto max-w-[900px] px-4 py-6 space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Upload Content</h1>
        <div className="h-0.5 w-full bg-white/10 rounded-full relative">
          <div
            className="h-0.5 rounded-full"
            style={{
              width: `${Math.round(
                (items.filter((i) => i.status === "done").length / Math.max(1, items.length)) * 100
              )}%`,
              backgroundColor: ACCENT,
            }}
          />
          <div
            className="absolute -top-[5px] h-3 w-3 rounded-full"
            style={{
              left: `calc(${Math.round(
                (items.filter((i) => i.status === "done").length / Math.max(1, items.length)) * 100
              )}% - 6px)`,
              backgroundColor: ACCENT,
            }}
          />
        </div>
      </div>

      <Card className="bg-[#121212] border-white/10">
        <div className="flex items-center gap-2 p-4 border-b border-white/10">
          <button
            onClick={onBack}
            className="rounded-full p-2 hover:bg-white/10 bg-white"
            aria-label="Back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <p className="font-semibold text-lg text-white/80">Bulk Upload Summary</p>
        </div>

        <div className="p-4 sm:p-6 space-y-2">
          <p className="text-white/80 text-sm mb-4">
            Once your upload is complete, you can access the embed link via the share button on each individual content piece.
          </p>

          <ul className="space-y-3">
            {items.map((it, i) => (
              <li
                key={i}
                className="flex items-center justify-between rounded-xl bg-black/40 border border-white/10 px-3 py-2.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative h-10 w-10 rounded-md overflow-hidden border border-white/10 bg-black">
                    <Image
                      src={it.previewUrl}
                      alt={it.file.name}
                      fill
                      unoptimized
                      sizes="40px"
                      className="object-cover"
                    />
                  </div>
                  <div className="truncate">
                    <div className="truncate text-sm">{it.file.name}</div>
                    {it.status === "uploading" && (
                      <div className="text-[11px] text-white/60">{it.progress}%</div>
                    )}
                    {it.status === "error" && (
                      <div className="text-[11px] text-red-400">Failed</div>
                    )}
                  </div>
                </div>

                <div className="ml-3 shrink-0">
                  {it.status === "done" ? (
                    <div
                      className="h-7 w-7 rounded-full grid place-items-center"
                      style={{ backgroundColor: ACCENT }}
                      aria-label="Uploaded"
                    >
                      <Check className="h-4 w-4 text-black" />
                    </div>
                  ) : it.status === "error" ? (
                    <div className="text-red-400 text-xs">!</div>
                  ) : (
                    <Spinner />
                  )}
                </div>
              </li>
            ))}
          </ul>

          {allDone && (
            <div className="pt-4">
              <Button
                className="rounded-full text-black font-semibold"
                style={{ backgroundColor: ACCENT }}
                onClick={onBack}
              >
                Done
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function Spinner() {
  return (
    <div className="relative h-7 w-7" role="status" aria-label="Uploading">
      <div className="absolute inset-0 rounded-full border-2 border-white/15" />
      <div
        className="absolute inset-0 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: ACCENT, borderTopColor: "transparent" }}
      />
    </div>
  );
}
