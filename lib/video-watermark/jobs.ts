
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export type WatermarkJob = {
  jobId: string;
  outputPath: string;
  root: string;
  createdAt: number;
};

const JOBS_DIR = path.join(
  os.tmpdir(),
  "print-watermark-jobs"
);

async function ensureJobsDir() {
  await fs.mkdir(JOBS_DIR, {
    recursive: true,
  });
}

function getJobPath(jobId: string) {
  return path.join(
    JOBS_DIR,
    `${jobId}.json`
  );
}

export async function saveWatermarkJob(
  job: WatermarkJob
) {
  await ensureJobsDir();

  await fs.writeFile(
    getJobPath(job.jobId),
    JSON.stringify(job),
    "utf8"
  );
}

export async function getWatermarkJob(
  jobId: string
): Promise<WatermarkJob | null> {
  try {
    const raw =
      await fs.readFile(
        getJobPath(jobId),
        "utf8"
      );

    return JSON.parse(raw) as WatermarkJob;
  } catch {
    return null;
  }
}

export async function deleteWatermarkJob(
  jobId: string
) {
  await fs.rm(
    getJobPath(jobId),
    {
      force: true,
    }
  );
}

export async function cleanupWatermarkJobs() {
  await ensureJobsDir();

  const files =
    await fs.readdir(
      JOBS_DIR
    );

  const expiry =
    Date.now() -
    30 * 60 * 1000;

  for (const file of files) {
    if (!file.endsWith(".json")) {
      continue;
    }

    const filePath =
      path.join(
        JOBS_DIR,
        file
      );

    try {
      const raw =
        await fs.readFile(
          filePath,
          "utf8"
        );

      const job =
        JSON.parse(raw) as WatermarkJob;

      if (
        job.createdAt <
        expiry
      ) {
        await fs.rm(
          filePath,
          {
            force: true,
          }
        );

        await fs.rm(
          job.root,
          {
            recursive: true,
            force: true,
          }
        ).catch(() => {});
      }
    } catch {
      /*
       * If a registry entry is malformed,
       * remove it so it cannot accumulate.
       */
      await fs.rm(
        filePath,
        {
          force: true,
        }
      ).catch(() => {});
    }
  }
}