
import fs from "node:fs";
import { stat } from "node:fs/promises";

import {
  getWatermarkJob,
} from "@/lib/video-watermark/jobs";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{
      jobId: string;
    }>;
  }
) {
  const { jobId } =
    await params;

  /*
   * Prevent malformed job IDs from being
   * used as filesystem paths.
   */
  if (
    !/^[a-f0-9]{32}$/i.test(
      jobId
    )
  ) {
    return new Response(
      "Invalid video ID.",
      {
        status: 400,
      }
    );
  }

  const job =
    await getWatermarkJob(
      jobId
    );

  if (!job) {
    return new Response(
      "Video not found.",
      {
        status: 404,
      }
    );
  }

  const fileInfo =
    await stat(
      job.outputPath
    ).catch(() => null);

  if (!fileInfo) {
    return new Response(
      "Video not found.",
      {
        status: 404,
      }
    );
  }

  const size =
    fileInfo.size;

  const range =
    request.headers.get(
      "range"
    );

  /*
   * Browser requested the entire file.
   */
  if (!range) {
    const stream =
      fs.createReadStream(
        job.outputPath
      );

    return new Response(
      stream as any,
      {
        status: 200,

        headers: {
          "Content-Type":
            "video/mp4",

          "Content-Length":
            String(size),

          "Accept-Ranges":
            "bytes",

          "Content-Disposition":
            "inline; filename=\"watermarked.mp4\"",

          "Cache-Control":
            "no-store",
        },
      }
    );
  }

  /*
   * Browser requested a byte range.
   *
   * Native HTML5 video players use
   * Range requests for seeking.
   */
  const match =
    range.match(
      /^bytes=(\d*)-(\d*)$/
    );

  if (!match) {
    return new Response(
      "Invalid range.",
      {
        status: 416,

        headers: {
          "Content-Range":
            `bytes */${size}`,
        },
      }
    );
  }

  let start =
    match[1]
      ? Number(match[1])
      : 0;

  let end =
    match[2]
      ? Number(match[2])
      : size - 1;

  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end)
  ) {
    return new Response(
      "Invalid range.",
      {
        status: 416,

        headers: {
          "Content-Range":
            `bytes */${size}`,
        },
      }
    );
  }

  end = Math.min(
    end,
    size - 1
  );

  if (
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return new Response(
      null,
      {
        status: 416,

        headers: {
          "Content-Range":
            `bytes */${size}`,
        },
      }
    );
  }

  const contentLength =
    end - start + 1;

  const stream =
    fs.createReadStream(
      job.outputPath,
      {
        start,
        end,
      }
    );

  return new Response(
    stream as any,
    {
      status: 206,

      headers: {
        "Content-Type":
          "video/mp4",

        "Content-Length":
          String(contentLength),

        "Content-Range":
          `bytes ${start}-${end}/${size}`,

        "Accept-Ranges":
          "bytes",

        "Content-Disposition":
          "inline; filename=\"watermarked.mp4\"",

        "Cache-Control":
          "no-store",
      },
    }
  );
}
