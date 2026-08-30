import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import ffmpegPath from "ffmpeg-static";

import {
  spawn,
} from "node:child_process";

import {
  buildWatermarkFilter,
  getFontPath,
} from "./ffmpeg";

import {
  createWatermarkSchedule,
} from "./scheduler";

export type WatermarkJobResult = {
  jobId: string;
  outputPath: string;
  duration: number;
};

function randomJobId() {
  return crypto.randomBytes(16).toString("hex");
}

function runCommand(
  command: string,
  args: string[],
  {
    allowNonZero = false,
  }: {
    allowNonZero?: boolean;
  } = {}
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    code: number;
  }>((resolve, reject) => {
    const child = spawn(
      command,
      args,
      {
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout?.on(
      "data",
      (chunk) => {
        stdout += chunk.toString();
      }
    );

    child.stderr?.on(
      "data",
      (chunk) => {
        stderr += chunk.toString();
      }
    );

    child.on(
      "error",
      reject
    );

    child.on(
      "close",
      (code) => {
        const exitCode =
          code ?? -1;

        if (
          exitCode === 0 ||
          allowNonZero
        ) {
          resolve({
            stdout,
            stderr,
            code: exitCode,
          });
        } else {
          reject(
            new Error(
              `FFmpeg process exited with code ${exitCode}`
            )
          );
        }
      }
    );
  });
}



async function getVideoDuration(
  inputPath: string
) {
  if (!ffmpegPath) {
    throw new Error(
      "FFmpeg is not available."
    );
  }

  const result = await runCommand(
  ffmpegPath,
  [
    "-hide_banner",
    "-i",
    inputPath,
  ],
  {
    allowNonZero: true,
  }
);

  /*
   * FFmpeg normally writes input metadata to stderr.
   *
   * Example:
   *
   * Duration: 00:01:23.45
   */

  const match =
    result.stderr.match(
      /Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/i
    );

  if (!match) {
    throw new Error(
      "Unable to determine video duration."
    );
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  const duration =
    hours * 3600 +
    minutes * 60 +
    seconds;

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw new Error(
      "Unable to determine video duration."
    );
  }

  return duration;
}



function buildSeed({
  fileName,
  fileSize,
  duration,
  username,
}: {
  fileName: string;
  fileSize: number;
  duration: number;
  username: string;
}) {
  return [
    fileName,
    fileSize,
    duration.toFixed(3),
    username,
  ].join("|");
}

export async function processWatermarkedVideo({
  inputBuffer,
  fileName,
  username,
  onProgress,
}: {
  inputBuffer: Buffer;
  fileName: string;
  username: string;
  onProgress?: (
    progress: number
  ) => void;
}) {
  if (!ffmpegPath) {
    throw new Error(
      "FFmpeg is not available."
    );
  }

  const jobId = randomJobId();

  const root =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "print-watermark-"
      )
    );

  const inputPath =
    path.join(root, "input");

  const outputPath =
    path.join(
      root,
      "watermarked.mp4"
    );

  
  try {
    await fs.writeFile(
      inputPath,
      inputBuffer
    );

    const duration =
      await getVideoDuration(
        inputPath
      );

    const text =
      `domain.com/${username}`;

    

    const seed = buildSeed({
      fileName,
      fileSize:
        inputBuffer.byteLength,
      duration,
      username,
    });

    const schedule =
      createWatermarkSchedule({
        duration,
        seed,
      });

    const fontPath =
      getFontPath();

    try {
      await fs.access(
        fontPath
      );
    } catch {
      throw new Error(
        "Watermark font is missing. Add public/fonts/Inter-Regular.ttf."
      );
    }

    
const filter =
  buildWatermarkFilter({
    schedule,
    text,
    fontFile: fontPath,
  });



    
await new Promise<void>((resolve, reject) => {
  const child = spawn(
    ffmpegPath!,
    [
      "-y",
      "-i",
      inputPath,

      "-vf",
      filter,

      "-map",
      "0:v:0",
      "-map",
      "0:a?",

      "-c:v",
      "libx264",
      "-preset",
      "fast",
      "-crf",
      "20",
      "-pix_fmt",
      "yuv420p",

      "-c:a",
      "aac",
      "-b:a",
      "128k",

      "-movflags",
      "+faststart",

      "-progress",
      "pipe:2",
      "-nostats",

      outputPath,
    ],
    {
      windowsHide: true,
    }
  );

  let fullStderr = "";
  let progressBuffer = "";

  child.stderr?.on("data", (chunk) => {
    const text = chunk.toString();

    // Keep ALL stderr for diagnostics.
    fullStderr += text;

    // Parse FFmpeg progress separately.
    progressBuffer += text;

    const lines = progressBuffer.split(/\r?\n/);

    // Keep the final incomplete line for the next chunk.
    progressBuffer = lines.pop() ?? "";

    for (const line of lines) {
      const separator = line.indexOf("=");

      if (separator === -1) {
        continue;
      }

      const key = line.slice(0, separator);
      const value = line.slice(separator + 1);

      if (key === "out_time_us") {
        const outputTimeUs = Number(value);

        if (
          Number.isFinite(outputTimeUs) &&
          duration > 0
        ) {
          const ratio =
            outputTimeUs / 1_000_000 / duration;

          const percent = Math.max(
            0,
            Math.min(
              99,
              Math.round(ratio * 100)
            )
          );

          onProgress?.(percent);
        }
      }
    }
  });

  child.stdout?.on("data", () => {
    // FFmpeg progress is intentionally read from stderr.
  });

  child.on("error", (error) => {
    console.error(
      "FFmpeg spawn error:",
      error
    );

    reject(error);
  });

  child.on("close", (code) => {
    if (code === 0) {
      onProgress?.(100);
      resolve();
      return;
    }

    console.error(
      "========== FFMPEG FAILURE =========="
    );
    console.error(
      "Exit code:",
      code
    );
    console.error(
      fullStderr
    );
    console.error(
      "====================================="
    );

    reject(
      new Error(
        `FFmpeg failed with exit code ${code}.`
      )
    );
  });
});


    return {
      jobId,
      outputPath,
      duration,
      root,
    };
  } catch (error) {
    await fs.rm(
      root,
      {
        recursive: true,
        force: true,
      }
    );

    throw error;
  }
}