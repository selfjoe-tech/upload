"use client";

import { Upload } from "tus-js-client";

export async function tusUploadToSupabase(opts: {
  file: File;
  bucket: string;
  path: string;
  token: string;
  projectRef: string;
  onProgress?: (pct: number) => void;
}) {
  const { file, bucket, path, token, projectRef, onProgress } = opts;

  const endpoint = `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    const upload = new Upload(file, {
      endpoint,
      chunkSize: 6 * 1024 * 1024,
      headers: {
        "x-signature": token,
        "x-upsert": "false",
      },
      metadata: {
        bucketName: bucket,
        objectName: path,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
      },
      onError: (err) => reject(err),
      onProgress: (sent, total) => {
        const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
        onProgress?.(pct);
      },
      onSuccess: () => resolve(),
    });

    upload.start();
  });
}
