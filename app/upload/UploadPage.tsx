
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

// import {
//   watermarkVideoFile,
// } from "@/lib/client/watermarkVideo";

import { getUserProfileFromCookies } from "@/lib/actions/auth";
import OverlayPortal from "@/app/components/ui/OverlayPortal";

const ACCENT = "pink";

const MAX_VIDEO_SIZE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SIZE_MB = 50;

type PostFlow =
  | { kind: "video"; clip: ClipSelection }
  | { kind: "images"; images: ImageSelection }
  | null;

export default function UploadPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const redirect =
    sp.get("redirect") || "https://upskirtcandy.com/";

  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingError, setProcessingError] =
    useState<string | null>(null);

  const [wmUsername, setWmUsername] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const prof = await getUserProfileFromCookies();

        if (prof.username) {
          setWmUsername(prof.username);
        }

        console.log(prof, "<<<<<<<<<< new");
      } catch (e) {
        console.error(
          "failed to get username for watermark",
          e
        );
      }
    })();
  }, []);

  const videoInputRef =
    useRef<HTMLInputElement | null>(null);

  const imageInputRef =
    useRef<HTMLInputElement | null>(null);

  const bulkInputRef =
    useRef<HTMLInputElement | null>(null);

  // video
  const [videoFile, setVideoFile] =
    useState<File | null>(null);

  const [videoUrl, setVideoUrl] =
    useState<string | null>(null);

  // images
  const [imageFiles, setImageFiles] =
    useState<File[]>([]);

  // flow
  const [postFlow, setPostFlow] =
    useState<PostFlow>(null);

  // UX
  const [isPreparing, setIsPreparing] =
    useState(false);

  const [prepError, setPrepError] =
    useState<string | null>(null);

  const [prepTarget, setPrepTarget] = useState<
    "video" | "images" | null
  >(null);

  const [bulkFiles, setBulkFiles] =
    useState<File[]>([]);

  useEffect(() => {
    return () => {
      if (videoUrl) {
        URL.revokeObjectURL(videoUrl);
      }
    };
  }, [videoUrl]);

  const onClose = () => {
    if (
      typeof window !== "undefined" &&
      window.history.length > 1
    ) {
      router.back();
    } else {
      router.replace(redirect);
    }
  };

 async function handlePickVideo(
  e: React.ChangeEvent<HTMLInputElement>
) {
  const f = e.target.files?.[0] ?? null;

  e.currentTarget.value = "";

  if (!f) return;

  // Reset any previous upload flow or media selection.
  setPostFlow(null);
  setImageFiles([]);
  setBulkFiles([]);
  setVideoFile(null);
  setVideoUrl(null);
  setPrepError(null);

  if (f.size > MAX_VIDEO_SIZE_BYTES) {
    setPrepError(
      `Videos larger than ${MAX_VIDEO_SIZE_MB} MB aren't allowed. Please choose a video that is ${MAX_VIDEO_SIZE_MB} MB or smaller.`
    );

    return;
  }

  setIsPreparing(true);
  setPrepTarget("video");

  let url: string | null = null;

  try {
    url = URL.createObjectURL(f);

    await ensureVideoUsable(url, {
      timeoutMs: 10000,
    });

    setVideoFile(f);
    setVideoUrl(url);
  } catch (err) {
    console.error(err);

    if (url) {
      URL.revokeObjectURL(url);
    }

    setVideoFile(null);
    setVideoUrl(null);

    setPrepError(
      "We couldn't load this video. Try another file (H.264/AAC MP4 is safest)."
    );
  } finally {
    setIsPreparing(false);
    setPrepTarget(null);
  }
}

 function handlePickImages(
  e: React.ChangeEvent<HTMLInputElement>
) {
  const picked = Array.from(e.target.files ?? []);

  e.currentTarget.value = "";

  if (picked.length === 0) return;

  // Reset any previous upload flow or media selection.
  setPostFlow(null);
  setVideoFile(null);
  setVideoUrl(null);
  setBulkFiles([]);
  setPrepError(null);

  setImageFiles(picked);
}
  // ============================================================
  // 1) VIDEO PREVIEW
  // ============================================================

  if (
    videoFile &&
    videoUrl &&
    postFlow === null
  ) {
    return (
      <VideoTrimEditor
        file={videoFile}
        src={videoUrl}
        onBack={() => {
          if (videoUrl) {
            URL.revokeObjectURL(videoUrl);
          }

          setVideoUrl(null);
          setVideoFile(null);
        }}
        onNext={(clip) =>
          setPostFlow({
            kind: "video",
            clip,
          })
        }
      />
    );
  }

  // ============================================================
  // 2) IMAGE PREVIEWER
  // ============================================================

  if (
    imageFiles.length > 0 &&
    postFlow === null
  ) {
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

          setPostFlow({
            kind: "images",
            images,
          });
        }}
      />
    );
  }

  // ============================================================
  // 3) UPLOAD FLOW — VIDEO
  // ============================================================

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
            const originalClip =
              postFlow.clip;

            /*
             * The video is no longer trimmed.
             *
             * The full original video is watermarked
             * and uploaded as-is.
             */

            

            setProgress(5);

            const processedFile: File = originalClip.file

            setProgress(78);

            /*
             * Because the video is no longer trimmed,
             * start/end represent the full original
             * video for compatibility with the
             * existing ClipSelection type.
             */
            const finalClip: ClipSelection = {
              ...originalClip,
              file: processedFile,
            };

            const row =
              await uploadTrimmedVideo(
                finalClip,
                {
                  title:
                    formValues.description?.slice(
                      0,
                      80
                    ) ?? "",

                  description:
                    formValues.description ?? "",

                  audience:
                    formValues.audience,

                  tags:
                    formValues.tags ?? [],
                },
                {
                  /*
                   * uploadTrimmedVideo can use the actual
                   * video duration when processing/uploading.
                   * No selection duration is used here.
                   */
                  onUploadProgress: (pct) =>
                    setProgress(
                      78 +
                        Math.round(
                          (pct / 100) *
                            20
                        )
                    ),
                }
              );

            console.log(
              "Inserted media row:",
              row
            );

            setProgress(100);

            setPostFlow(null);
            setVideoFile(null);

            if (videoUrl) {
              URL.revokeObjectURL(videoUrl);
            }

            setVideoUrl(null);

            router.push(
              "https://upskirtcandy.com/"
            );
          } catch (err: any) {
            console.error(err);

            const msg =
              err?.message ??
              "Upload failed, please try again.";

            setProcessingError(msg);

            throw new Error(msg);
          } finally {
            setProcessing(false);
          }
        }}
      />
    );
  }

  // ============================================================
  // 3B) UPLOAD FLOW — IMAGES
  // ============================================================

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
            const {
              successes,
              failures,
            } =
              await uploadImagesBatch(
                postFlow.images.files,
                {
                  title: undefined,
                  description:
                    formValues.description,
                  audience:
                    formValues.audience,
                }
              );

            console.log(
              "Image upload successes:",
              successes
            );

            if (failures.length > 0) {
              console.warn(
                "Some images failed to upload:",
                failures
              );
            }

            setPostFlow(null);
            setImageFiles([]);

            router.push(
              "https://upskirtcandy.com/"
            );
          } catch (err: any) {
            console.error(err);

            alert(
              err?.message ??
                "Image upload failed, please try again."
            );
          }
        }}
      />
    );
  }

  // ============================================================
  // 3C) BULK IMAGE SUMMARY
  // ============================================================

  async function uploadImageToSupabase(
    file: File,
    onProgress: (p: number) => void
  ) {
    const row =
      await uploadSingleImage(
        file,
        {
          audience: "straight",
          description: "",
          title: file.name,
        },
        {
          onUploadProgress: onProgress,
        }
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

  // ============================================================
  // 4) PICKER UI
  // ============================================================

  return (
    <div className="relative isolate min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)]">
      {processing && (
        <OverlayPortal>
          <div className="fixed inset-0 z-[9999] pointer-events-none">
            <div className="absolute bottom-4 left-1/2 w-full max-w-md -translate-x-1/2 px-4 pointer-events-auto">
              <div className="rounded-2xl border border-white/15 bg-black/80 p-4 space-y-2 shadow-xl backdrop-blur">
                <div className="flex justify-between text-xs text-white/80">
                  <span>
                    Processing video…
                  </span>

                  <span>
                    {progress}%
                  </span>
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
                  <p className="text-xs text-red-400 mt-1">
                    {processingError}
                  </p>
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

        <h1 className="text-lg font-semibold">
          Upload
        </h1>
      </header>

      <div className="mx-auto max-w-[680px] px-4 py-6">
        <p className="text-center text-white/90 text-base mb-6">
          Choose a file.
        </p>

        <Card className="bg-[#101010] border-white/15 rounded-3xl px-4 sm:px-6 py-6 space-y-4">
          <BigOutlineButton
            onClick={() =>
              videoInputRef.current?.click()
            }
            icon={
              <FileVideo className="h-5 w-5" />
            }
            label="Select a Video"
          />

          <p className="text-sm text-red-500">
            Videos must be{" "}
            <span className="font-semibold">
              {MAX_VIDEO_SIZE_MB} MB or smaller.
            </span>{" "}
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
            <p className="text-xs text-red-400 px-2">
              {prepError}
            </p>
          )}

          <BigOutlineButton
            onClick={() =>
              imageInputRef.current?.click()
            }
            icon={
              <ImagePlus className="h-5 w-5" />
            }
            label="Select Image"
          />

          <input
            ref={imageInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePickImages}
          />

          <p className="flex gap-2 text-sm text-white/70 mt-2 px-1">
            Users who are verified get more views and interaction.

            <Link href="https://upskirtcandy.com/verify">
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

          <span className="text-white/80 text-sm">
            OR
          </span>

          <Separator className="flex-1 bg-white/10" />
        </div>

        <Card className="bg-[#101010] border-white/15 rounded-3xl px-4 sm:px-6 py-6 space-y-4">
          <p className="text-sm text-white/85 leading-relaxed">
            <span className="font-semibold">
              Bulk upload up to 50 images.
            </span>
          </p>

          <BigOutlineButton
            onClick={() =>
              bulkInputRef.current?.click()
            }
            icon={
              <ImagePlus className="h-5 w-5" />
            }
            label="Bulk Upload Images"
          />

          <input
            ref={bulkInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const selected = Array.from(
                e.target.files ?? []
              );

              e.currentTarget.value = "";

              setBulkFiles(
                selected.slice(0, 50)
              );
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

/**
 * Preflight: ensure the blob VIDEO URL is usable.
 *
 * Duration is deliberately ignored.
 *
 * This only verifies that the browser can load the
 * selected video successfully.
 */
async function ensureVideoUsable(
  url: string,
  {
    timeoutMs = 10000,
  }: {
    timeoutMs?: number;
  } = {}
): Promise<void> {
  const v = document.createElement("video");

  v.preload = "metadata";
  v.muted = true;
  v.playsInline = true;
  v.src = url;

  await new Promise<void>(
    (resolve, reject) => {
      const timeout = setTimeout(
        () => {
          reject(
            new Error(
              "metadata-timeout"
            )
          );
        },
        timeoutMs
      );

      v.addEventListener(
        "loadedmetadata",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true }
      );

      v.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(
            new Error(
              "metadata-error"
            )
          );
        },
        { once: true }
      );
    }
  );

  await new Promise<void>((resolve) => {
    const done = () => resolve();

    v.addEventListener(
      "canplay",
      done,
      { once: true }
    );

    setTimeout(done, 150);
  });
}

