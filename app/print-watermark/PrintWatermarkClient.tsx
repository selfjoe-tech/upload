"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  CheckCircle2,
  Download,
  FileVideo,
  Loader2,
  Upload,
  X,
} from "lucide-react";

const MAX_EXPERIMENTAL_SIZE =
  200 * 1024 * 1024;

type Metadata = {
  duration: number | null;
  width: number | null;
  height: number | null;
};

type ProcessingState =
  | "idle"
  | "processing"
  | "complete"
  | "error";

export default function PrintWatermarkClient() {
  const inputRef =
    useRef<HTMLInputElement | null>(
      null
    );

  const [username, setUsername] =
    useState("john123");

  const [file, setFile] =
    useState<File | null>(null);

  const [
    originalUrl,
    setOriginalUrl,
  ] = useState<string | null>(null);

  const [
    processedUrl,
    setProcessedUrl,
  ] = useState<string | null>(null);

  const [
    metadata,
    setMetadata,
  ] = useState<Metadata>({
    duration: null,
    width: null,
    height: null,
  });

  const [
    progress,
    setProgress,
  ] = useState(0);

  const [
    state,
    setState,
  ] =
    useState<ProcessingState>(
      "idle"
    );

  const [
    status,
    setStatus,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState<string | null>(
    null
  );

  useEffect(() => {
    return () => {
      if (originalUrl) {
        URL.revokeObjectURL(
          originalUrl
        );
      }
    };
  }, [originalUrl]);

  function resetProcessed() {
    setProcessedUrl(null);
    setProgress(0);
    setStatus("");
    setError(null);
    setState("idle");
  }

  function handleFile(
    selected: File
  ) {
    resetProcessed();

    if (
      selected.size >
      MAX_EXPERIMENTAL_SIZE
    ) {
      setError(
        "This experimental page accepts videos up to 200 MB."
      );
      return;
    }

    if (
      !selected.type.startsWith(
        "video/"
      )
    ) {
      setError(
        "Please select a video file."
      );
      return;
    }

    if (originalUrl) {
      URL.revokeObjectURL(
        originalUrl
      );
    }

    const url =
      URL.createObjectURL(
        selected
      );

    setFile(selected);
    setOriginalUrl(url);

    const video =
      document.createElement(
        "video"
      );

    video.preload =
      "metadata";

    video.onloadedmetadata =
      () => {
        setMetadata({
          duration:
            Number.isFinite(
              video.duration
            )
              ? video.duration
              : null,

          width:
            video.videoWidth ||
            null,

          height:
            video.videoHeight ||
            null,
        });
      };

    video.src = url;
  }

  async function processVideo() {
    if (!file) {
      setError(
        "Select a video first."
      );
      return;
    }

    if (!username.trim()) {
      setError(
        "Enter a username."
      );
      return;
    }

    setError(null);
    setState("processing");
    setProgress(1);
    setStatus(
      "Preparing video…"
    );
    setProcessedUrl(null);

    try {
      const formData =
        new FormData();

      formData.append(
        "video",
        file
      );

      formData.append(
        "username",
        username.trim()
      );

      const response =
        await fetch(
          "/api/print-watermark",
          {
            method: "POST",
            body: formData,
          }
        );

      if (!response.ok) {
        throw new Error(
          "Unable to start video processing."
        );
      }

      if (!response.body) {
        throw new Error(
          "The processing stream was unavailable."
        );
      }

      const reader =
        response.body.getReader();

      const decoder =
        new TextDecoder();

      let buffer = "";

      while (true) {
        const {
          value,
          done,
        } =
          await reader.read();

        if (done) break;

        buffer +=
          decoder.decode(
            value,
            {
              stream: true,
            }
          );

        const events =
          buffer.split("\n\n");

        buffer =
          events.pop() ?? "";

        for (const event of events) {
          const line =
            event
              .split("\n")
              .find((line) =>
                line.startsWith(
                  "data:"
                )
              );

          if (!line) continue;

          const data =
            JSON.parse(
              line.slice(5).trim()
            );

          if (
            data.type ===
            "status"
          ) {
            setStatus(
              data.message
            );
          }

          if (
            data.type ===
            "progress"
          ) {
            setProgress(
              data.progress
            );

            setStatus(
              data.progress >= 100
                ? "Finalizing…"
                : `Processing: ${data.progress}%`
            );
          }

          if (
            data.type ===
            "complete"
          ) {
            const url =
              data.url;

            setProcessedUrl(
              url
            );

            setProgress(100);
            setStatus(
              "Complete"
            );
            setState(
              "complete"
            );
          }

          if (
            data.type ===
            "error"
          ) {
            throw new Error(
              data.message ||
                "Video processing failed."
            );
          }
        }
      }
    } catch (err) {
      console.error(err);

      setState("error");

      setError(
        err instanceof Error
          ? err.message
          : "Video processing failed."
      );
    }
  }

  function clearFile() {
    if (originalUrl) {
      URL.revokeObjectURL(
        originalUrl
      );
    }

    setFile(null);
    setOriginalUrl(null);

    setMetadata({
      duration: null,
      width: null,
      height: null,
    });

    resetProcessed();
  }

  const usernameValid =
    /^[a-zA-Z0-9_.-]{1,40}$/.test(
      username.trim()
    );

  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold">
            Video Watermark Test
          </h1>

          <p className="mt-2 text-sm text-white/60">
            Experimental standalone
            watermark processor.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
          {/* SETTINGS */}

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
            <div className="space-y-5">
              <div>
                <label className="mb-2 block text-sm font-medium">
                  Username
                </label>

                <input
                  value={username}
                  onChange={(e) =>
                    setUsername(
                      e.target.value
                    )
                  }
                  placeholder="john123"
                  disabled={
                    state ===
                    "processing"
                  }
                  className="w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm outline-none transition focus:border-pink-500"
                />

                <p className="mt-2 text-xs text-white/40">
                  Watermark:
                  {" "}
                  <span className="text-white/70">
                    domain.com/
                    {username ||
                      "[username]"}
                  </span>
                </p>

                {!usernameValid &&
                  username.length > 0 && (
                    <p className="mt-2 text-xs text-red-400">
                      Use only letters,
                      numbers, dots,
                      underscores, and
                      hyphens.
                    </p>
                  )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() =>
                    inputRef.current?.click()
                  }
                  disabled={
                    state ===
                    "processing"
                  }
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
                >
                  <Upload className="h-4 w-4" />
                  Select Video
                </button>

                <input
                  ref={inputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(event) => {
                    const selected =
                      event.target.files?.[0];

                    event.currentTarget.value =
                      "";

                    if (selected) {
                      handleFile(
                        selected
                      );
                    }
                  }}
                />
              </div>

              {file && (
                <div className="rounded-xl border border-white/10 bg-black/50 p-4">
                  <div className="flex items-start gap-3">
                    <FileVideo className="mt-0.5 h-5 w-5 text-pink-500" />

                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {file.name}
                      </p>

                      <p className="mt-1 text-xs text-white/50">
                        {formatBytes(
                          file.size
                        )}
                      </p>

                      {metadata.width &&
                        metadata.height && (
                          <p className="mt-1 text-xs text-white/50">
                            {
                              metadata.width
                            }
                            {" × "}
                            {
                              metadata.height
                            }
                          </p>
                        )}

                      {metadata.duration !==
                        null && (
                        <p className="mt-1 text-xs text-white/50">
                          {formatDuration(
                            metadata.duration
                          )}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={
                        clearFile
                      }
                      className="rounded-full p-1.5 text-white/50 hover:bg-white/10 hover:text-white"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={
                  processVideo
                }
                disabled={
                  !file ||
                  !usernameValid ||
                  state ===
                    "processing"
                }
                className="w-full rounded-xl bg-pink-500 px-4 py-3 font-semibold text-black transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {state ===
                "processing" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing…
                  </span>
                ) : (
                  "Process Video"
                )}
              </button>

              {state ===
                "processing" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span>
                      {status ||
                        "Processing…"}
                    </span>

                    <span>
                      {progress}%
                    </span>
                  </div>

                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-pink-500 transition-[width]"
                      style={{
                        width: `${progress}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {state ===
                "complete" && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  Watermark processing
                  complete.
                </div>
              )}
            </div>
          </section>

          {/* PREVIEWS */}

          <section className="grid gap-6 md:grid-cols-2">
            <PreviewCard
              title="Original Video"
              src={originalUrl}
            />

            <PreviewCard
              title="Watermarked Video"
              src={processedUrl}
            />
          </section>
        </div>

        {processedUrl && (
          <div className="mt-6">
            <a
              href={processedUrl}
              download={`watermarked-${file?.name || "video.mp4"}`}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              <Download className="h-4 w-4" />
              Download Watermarked Video
            </a>
          </div>
        )}
      </div>
    </main>
  );
}

function PreviewCard({
  title,
  src,
}: {
  title: string;
  src: string | null;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="border-b border-white/10 px-4 py-3">
        <h2 className="text-sm font-semibold">
          {title}
        </h2>
      </div>

      <div className="aspect-video bg-black">
        {src ? (
          <video
            src={src}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-white/30">
            No video yet
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(
  bytes: number
) {
  if (bytes < 1024 * 1024) {
    return `${(
      bytes / 1024
    ).toFixed(1)} KB`;
  }

  return `${(
    bytes /
    1024 /
    1024
  ).toFixed(1)} MB`;
}

function formatDuration(
  seconds: number
) {
  const total =
    Math.floor(seconds);

  const minutes =
    Math.floor(total / 60);

  const secs =
    total % 60;

  return `${minutes}:${secs
    .toString()
    .padStart(2, "0")}`;
}