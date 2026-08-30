
import { NextRequest } from "next/server";

import {
  processWatermarkedVideo,
} from "@/lib/video-watermark/watermark";

import {
  saveWatermarkJob,
  cleanupWatermarkJobs,
} from "@/lib/video-watermark/jobs";

export const runtime = "nodejs";

const MAX_EXPERIMENTAL_SIZE =
  200 * 1024 * 1024;

function jsonEvent(
  type: string,
  payload: unknown
) {
  return (
    `data: ${JSON.stringify({
      type,
      ...((payload ?? {}) as object),
    })}\n\n`
  );
}

function validUsername(
  username: string
) {
  return /^[a-zA-Z0-9_.-]{1,40}$/.test(
    username
  );
}

export async function POST(
  request: NextRequest
) {
  const formData =
    await request.formData();

  const file =
    formData.get("video");

  const username =
    String(
      formData.get("username") ?? ""
    ).trim();

  if (!(file instanceof File)) {
    return new Response(
      JSON.stringify({
        error:
          "A video file is required.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  if (!validUsername(username)) {
    return new Response(
      JSON.stringify({
        error:
          "Username may only contain letters, numbers, dots, underscores, and hyphens.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  if (
    !file.type.startsWith("video/")
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Please select a video file.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  if (
    file.size >
    MAX_EXPERIMENTAL_SIZE
  ) {
    return new Response(
      JSON.stringify({
        error:
          "This experimental page accepts videos up to 200 MB.",
      }),
      {
        status: 400,
        headers: {
          "Content-Type":
            "application/json",
        },
      }
    );
  }

  /*
   * Clean up stale experimental jobs
   * before starting a new one.
   */
  await cleanupWatermarkJobs().catch(
    (error) => {
      console.error(
        "Watermark cleanup error:",
        error
      );
    }
  );

  const inputBuffer =
    Buffer.from(
      await file.arrayBuffer()
    );

  const encoder =
    new TextEncoder();

  const stream =
    new ReadableStream({
      async start(controller) {
        const send = (
          type: string,
          payload: unknown = {}
        ) => {
          controller.enqueue(
            encoder.encode(
              jsonEvent(
                type,
                payload
              )
            )
          );
        };

        try {
          send("status", {
            message:
              "Preparing video…",
          });

          send("progress", {
            progress: 1,
          });

          const result =
            await processWatermarkedVideo({
              inputBuffer,
              fileName:
                file.name,
              username,
              onProgress: (
                progress
              ) => {
                send(
                  "progress",
                  {
                    progress,
                  }
                );
              },
            });

          /*
           * Persist the job information on disk.
           *
           * The output API route can therefore
           * retrieve the processed file even though
           * it is a separate Next.js route module.
           */
          await saveWatermarkJob({
            jobId:
              result.jobId,
            outputPath:
              result.outputPath,
            root:
              result.root,
            createdAt:
              Date.now(),
          });

          send("complete", {
            jobId:
              result.jobId,

            url:
              `/api/print-watermark/output/${result.jobId}`,
          });
        } catch (error) {
          console.error(
            "print-watermark error:",
            error
          );

          send("error", {
            message:
              error instanceof Error
                ? error.message
                : "Video processing failed.",
          });
        } finally {
          controller.close();
        }
      },
    });

  return new Response(
    stream,
    {
      headers: {
        "Content-Type":
          "text/event-stream; charset=utf-8",

        "Cache-Control":
          "no-cache, no-transform",

        Connection:
          "keep-alive",
      },
    }
  );
}