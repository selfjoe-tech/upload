"use client";

import { useRef, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { X, FileVideo, ImagePlus, Loader2 } from "lucide-react";

import VideoTrimEditor from "@/app/components/upload/VideoTrimEditor";
import UploadFlow, {
  type ClipSelection,
  type ImageSelection,
} from "@/app/components/upload/UploadFlow";
import ImagePreviewer, {
  type ImagePreviewPayload,
} from "@/app/components/upload/ImagePreviewer";
import BulkImageSummary from "@/app/components/upload/BulkImageSummary";

import {
  uploadTrimmedVideo,
  uploadSingleImage,
  uploadImagesBatch,
} from "@/lib/client/mediaUploads";
import Link from "next/link";
import {
  watermarkVideoFile,
} from "@/lib/client/watermarkVideo";

import { getUserProfileFromCookies } from "@/lib/actions/auth";
import OverlayPortal from "@/app/components/ui/OverlayPortal";


const ACCENT = "pink";

type PostFlow =
  | { kind: "video"; clip: ClipSelection }
  | { kind: "images"; images: ImageSelection }
  | null;


// Helper: send original clip + range to server, get a *trimmed* File back




export default function UploadPage() {
  const MAX_VIDEO_SECONDS = 65;
  const router = useRouter();
  const sp = useSearchParams();
  const redirect = sp.get("redirect") || "https://upskirtcandy.com/";

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [wmUsername, setWmUsername] = useState<string>("");
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);


  useEffect(() => {
  (async () => {
    try {
      const prof = await getUserProfileFromCookies();
      if (prof.username) setWmUsername(prof.username);
      console.log(prof, "<<<<<<<<<<,")

    } catch (e) {
      console.error("failed to get username for watermark", e);
    }
  })();
}, []);




  const videoInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const bulkInputRef = useRef<HTMLInputElement | null>(null);

  // video
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  // images (multi)
  const [imageFiles, setImageFiles] = useState<File[]>([]);

  // flow
  const [postFlow, setPostFlow] = useState<PostFlow>(null);

  // UX
  const [isPreparing, setIsPreparing] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);
  const [prepTarget, setPrepTarget] = useState<"video" | "images" | null>(null);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  const onClose = () => {
    if (typeof window !== "undefined" && window.history.length > 1)
      router.back();
    else router.replace(redirect);
  };

  async function handlePickVideo(e: React.ChangeEvent<HTMLInputElement>) {
  const f = e.target.files?.[0] ?? null;
  e.currentTarget.value = "";
  if (!f) return;

  setPrepError(null);
  setIsPreparing(true);
  setPrepTarget("video");

  let url: string | null = null;

  try {
    url = URL.createObjectURL(f);
    const durationSec = await ensureVideoUsable(url, { timeoutMs: 10000 });

    // Hard block: > 60s not allowed (no trimming)
    if (durationSec > MAX_VIDEO_SECONDS + 0.05) {
      URL.revokeObjectURL(url);
      url = null;

      setVideoFile(null);
      setVideoUrl(null);
      setVideoDurationSec(null);

      setPrepError(
        "Videos longer than 1 minute aren’t allowed right now. Please upload a 60s (or shorter) clip."
      );
      return;
    }

    setVideoFile(f);
    setVideoUrl(url);
    setVideoDurationSec(durationSec);
  } catch (err) {
    console.error(err);
    if (url) URL.revokeObjectURL(url);

    setVideoFile(null);
    setVideoUrl(null);
    setVideoDurationSec(null);

    setPrepError(
      "We couldn't load this video. Try another file (H.264/AAC MP4 is safest)."
    );
  } finally {
    setIsPreparing(false);
    setPrepTarget(null);
  }
}


  function handlePickImages(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.currentTarget.value = "";
    if (picked.length === 0) return;
    setPrepError(null);
    setImageFiles(picked); // URLs handled inside ImagePreviewer
  }

  // ===== branches =====

  // 1) video trim editor
  if (videoFile && videoUrl && postFlow === null) {
    return (
      <VideoTrimEditor
        file={videoFile}
        src={videoUrl}
        onBack={() => {
          if (videoUrl) URL.revokeObjectURL(videoUrl);
          setVideoUrl(null);
          setVideoFile(null);
          setVideoDurationSec(null);
        }}
        onNext={(clip) => setPostFlow({ kind: "video", clip })}
      />
    );
  }

  // 2) image previewer
  if (imageFiles.length > 0 && postFlow === null) {
    return (
      <ImagePreviewer
        files={imageFiles}
        onBack={() => setImageFiles([])}
        onNext={(payload: ImagePreviewPayload) => {
          const images: ImageSelection = {
            files: payload.files,
            order: payload.order,
            coverIndex: payload.coverIndex,
          };
          setPostFlow({ kind: "images", images });
        }}
      />
    );
  }

  // 3) unified UploadFlow – VIDEO
  if (postFlow?.kind === "video") {
  return (
    <UploadFlow
      variant="video"
      clip={postFlow.clip}
      processing={processing}
      progress={progress}
      processingError={processingError}
      processingLabel="Processing video…"
      onCancel={() => setPostFlow(null)}
            onSubmit={async (formValues) => {
        setProcessing(true);
        setProcessingError(null);
        setProgress(0);

        try {
          const originalClip = postFlow.clip;

          const selectionDuration = Math.max(0, originalClip.end - originalClip.start);
          const originalDuration = videoDurationSec ?? 0;


          const username = wmUsername.trim();

          setProgress(5);

          
          let durationSecondsToStore: number;

            // Trim + watermark in one pass
            
            durationSecondsToStore = selectionDuration;
          
            // No trimming: ignore the trim selection and watermark the whole clip
            const processedFile: File = await watermarkVideoFile(originalClip.file, username, {
              onProgress: (ratio) => setProgress(5 + Math.round(ratio * 70)), // 5..75
            });

            durationSecondsToStore = originalDuration;
          

          setProgress(78);

          const finalClip: ClipSelection = {
            ...originalClip,
            file: processedFile,
            start: 0,
            end: durationSecondsToStore,
          };

          const row = await uploadTrimmedVideo(
            finalClip,
            {
              title: formValues.description?.slice(0, 80) ?? "",
              description: formValues.description ?? "",
              audience: formValues.audience,
              tags: formValues.tags ?? [], // ✅ store tags into media.tags text[]
            },
            {
              durationSeconds: durationSecondsToStore,
              onUploadProgress: (pct) => setProgress(78 + Math.round((pct / 100) * 20)), // 78..98
            }
          );

          console.log("Inserted media row:", row);
          setProgress(100);

          setPostFlow(null);
          setVideoFile(null);
          if (videoUrl) URL.revokeObjectURL(videoUrl);
          router.push("https://upskirtcandy.com/");
        } catch (err: any) {
          console.error(err);
          const msg = err?.message ?? "Upload failed, please try again.";
          setProcessingError(msg);
          throw new Error(msg);
        } finally {
          setProcessing(false);
        }
      }}
    />
  );
}


  // 3b) unified UploadFlow – IMAGES
  if (postFlow?.kind === "images") {
    return (
      <UploadFlow
        variant="images"
        images={postFlow.images}
        onCancel={() => setPostFlow(null)}
        processing={processing}
        progress={progress}
        processingError={processingError}
        processingLabel="Processing video…"
        onSubmit={async (formValues: any) => {
          try {
            const { successes, failures } = await uploadImagesBatch(
              postFlow.images.files,
              {
                title: undefined,
                description: formValues.description,
                audience: formValues.audience,
              }
            );

            console.log("Image upload successes:", successes);
            if (failures.length > 0) {
              console.warn("Some images failed to upload:", failures);
            }

            setPostFlow(null);
            setImageFiles([]);
            router.push("https://upskirtcandy.com/");
          } catch (err: any) {
            console.error(err);
            alert(err?.message ?? "Image upload failed, please try again.");
          }
        }}
      />
    );
  }

  // 3c) bulk image summary – per-file uploadFn
  async function uploadImageToSupabase(file: File, onProgress: (p: number) => void) {
  const row = await uploadSingleImage(
    file,
    { audience: "straight", description: "", title: file.name },
    { onUploadProgress: onProgress }
  );
  return row.storage_path ?? "";
}



  if (bulkFiles.length > 0) {
    return (
      <BulkImageSummary
        files={bulkFiles}
        onBack={() => setBulkFiles([])}
        uploadFn={uploadImageToSupabase}
      />
    );
  }

  // 4) picker UI
  return (
<div className="relative isolate min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
      {processing && (
  <OverlayPortal>
    <div className="fixed inset-0 z-[9999] pointer-events-none">
      <div className="absolute bottom-4 left-1/2 w-full max-w-md -translate-x-1/2 px-4 pointer-events-auto">
        <div className="rounded-2xl border border-white/15 bg-black/80 p-4 space-y-2 shadow-xl backdrop-blur">
          <div className="flex justify-between text-xs text-white/80">
            <span>Processing video…</span>
            <span>{progress}%</span>
          </div>

          <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, rgb(236,72,153), rgb(251,191,36))",
              }}
            />
          </div>

          {processingError && (
            <p className="text-xs text-red-400 mt-1">{processingError}</p>
          )}
        </div>
      </div>
    </div>
  </OverlayPortal>
)}

      <header className="sticky top-0 z-10 flex items-center justify-center h-14 bg-black/80 backdrop-blur border-b border-white/10">
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute left-4 rounded-full p-2 hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Upload</h1>
      </header>

      <div className="mx-auto max-w-[680px] px-4 py-6">
        <p className="text-center text-white/90 text-base mb-6">
          Choose a file.
        </p>

        <Card className="bg-[#101010] border-white/15 rounded-3xl px-4 sm:px-6 py-6 space-y-4">
          <BigOutlineButton
            onClick={() => videoInputRef.current?.click()}
            icon={<FileVideo className="h-5 w-5" />}
            label="Select a Video"
          />

          <p className="flex text-sm text-red-500 ">
            Videos longer than 1 minute are not allowed. 

          </p>

      <p className="text-sm text-red-500 leading-snug">
  We recommend using{" "}
  <a
    href="https://online-video-cutter.com/"
    target="_blank"
    rel="noopener noreferrer"
    className="text-pink-500 underline underline-offset-2 whitespace-nowrap"
  >
    123apps.com
  </a>{" "}
  for clipping videos. It’s fast and free.
</p>


          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handlePickVideo}
          />

          {prepError && (
            <p className="text-xs text-red-400 px-2">{prepError}</p>
          )}

          <BigOutlineButton
            onClick={() => imageInputRef.current?.click()}
            icon={<ImagePlus className="h-5 w-5" />}
            label="Select Image"
          />

          
          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePickImages}
          />

          <p className="flex gap-2 text-sm text-white/70 mt-2 px-1">
            Users who are verified get more views and interaction.
            <Link
              href={"/verify"}
            >
            <button
              className="underline underline-offset-4 font-medium"
              style={{ color: ACCENT }}
              type="button"
            >
              Get verified.
            </button>
            </Link>
            
          </p>
        </Card>

        <div className="my-6 flex items-center gap-4">
          <Separator className="flex-1 bg-white/10" />
          <span className="text-white/80 text-sm">OR</span>
          <Separator className="flex-1 bg-white/10" />
        </div>

        <Card className="bg-[#101010] border-white/15 rounded-3xl px-4 sm:px-6 py-6 space-y-4">
          <p className="text-sm text-white/85 leading-relaxed">
            <span className="font-semibold">
              Bulk upload up to 50 images.
            </span>{" "}
          </p>

          <BigOutlineButton
            onClick={() => bulkInputRef.current?.click()}
            icon={<ImagePlus className="h-5 w-5" />}
            label="Bulk Upload Images"
          />
          <input
            ref={bulkInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const selected = Array.from(e.target.files ?? []);
              e.currentTarget.value = ""; // allow same selection twice
              setBulkFiles(selected.slice(0, 50)); // go to Bulk summary
            }}
          />
        </Card>
      </div>

      {isPreparing && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur grid place-items-center">
          <div className="rounded-2xl border border-white/15 bg-black/80 px-6 py-5 flex items-center gap-3 text-white">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>
              {prepTarget === "video"
                ? "Preparing your video…"
                : prepTarget === "images"
                ? "Preparing your images…"
                : "Preparing your file(s)…"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function BigOutlineButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant="ghost"
      className="w-full h-14 rounded-[28px] border border-white/35 bg-black/30 hover:bg-white/10
                 justify-start px-4 text-base font-semibold text-white
                 flex items-center gap-3"
    >
      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-white/10 border border-white/25">
        {icon}
      </span>
      {label}
    </Button>
  );
}

/** Preflight: ensure the blob VIDEO URL is usable */
/** Preflight: ensure the blob VIDEO URL is usable + return duration (seconds) */
async function ensureVideoUsable(
  url: string,
  { timeoutMs = 10000 }: { timeoutMs?: number } = {}
): Promise<number> {
  const v = document.createElement("video");
  v.preload = "metadata";
  (v as any).muted = true;
  (v as any).playsInline = true;
  v.src = url;

  const duration = await new Promise<number>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("metadata-timeout")), timeoutMs);

    v.addEventListener(
      "loadedmetadata",
      () => {
        clearTimeout(t);
        const d = Number.isFinite(v.duration) ? v.duration : 0;
        resolve(d);
      },
      { once: true }
    );

    v.addEventListener(
      "error",
      () => {
        clearTimeout(t);
        reject(new Error("metadata-error"));
      },
      { once: true }
    );
  });

  await new Promise<void>((resolve) => {
    const done = () => resolve();
    v.addEventListener("canplay", done, { once: true });
    setTimeout(done, 150);
  });

  return duration;
}
