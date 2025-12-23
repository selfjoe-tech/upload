"use client";

import { supabase } from "@/lib/supabaseClient";

import { requireUserIdFromCookies } from "../server/requireUser";

export type AudienceType =
  | "straight"
  | "gay"
  | "trans"
  | "bisexual"
  | "lesbian"
  | "animated";

export type ClipSelection = {
  file: File;
  start: number;
  end: number;
  muted: boolean;
};

export type VideoUploadFormValues = {
  title?: string;
  description?: string;
  audience: AudienceType;
  tags?: string[];
};

export type ImageUploadFormValues = {
  title?: string;
  description?: string;
  audience: AudienceType;
  tags?: string[];
};

export type InsertedMediaRow = {
  id: number;
  storage_path?: string | null;
};

function getExt(file: File, fallback: string) {
  const extRaw = file.name.split(".").pop();
  const ext = (extRaw && extRaw.toLowerCase()) || fallback;
  return ext;
}

function makeStoragePath(kind: "video" | "image", ownerId: string, file: File) {
  const ext = getExt(file, kind === "video" ? "mp4" : "jpg");

  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);

  const folder = kind === "video" ? "videos" : "images";
  return `${folder}/${ownerId}/${random}.${ext}`;
}



async function uploadToStorage(path: string, file: File): Promise<void> {
  const { error } = await supabase.storage.from("media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });

  if (error) {
    console.error("Storage upload error", error);
    throw new Error(error.message || "Failed to upload file to storage.");
  }
}

async function insertMediaRow(params: {
  ownerId: string;
  mediaType: "video" | "image";
  audience: AudienceType;
  storagePath: string;
  title?: string;
  description?: string;
  durationSeconds?: number | null;
  tags?: string[];
}): Promise<InsertedMediaRow> {
  const { data, error } = await supabase
    .from("media")
    .insert({
      owner_id: params.ownerId,
      media_type: params.mediaType,
      audience: params.audience,
      title: params.title ?? null,
      description: params.description ?? null,
      storage_path: params.storagePath,
      duration_seconds:
        typeof params.durationSeconds === "number"
          ? params.durationSeconds
          : null,
      tags: params.tags ?? [],
    })
    .select("id, storage_path")
    .single();

  if (error) {
    console.error("DB insert error", error);
    throw new Error(error.message || "Failed to create media record.");
  }

  return data as InsertedMediaRow;
}

// ----------------- VIDEO -----------------

export async function uploadTrimmedVideo(
  clip: ClipSelection,
  form: VideoUploadFormValues,
  opts?: { onUploadProgress?: (pct: number) => void; durationSeconds?: number }
): Promise<InsertedMediaRow> {
  // NOTE: Supabase upload() does not provide upload progress.
  // We’ll do a simple 0 -> 100 callback so your UI doesn't break.
  opts?.onUploadProgress?.(0);

  const ownerId = await requireUserIdFromCookies();
  const storagePath = makeStoragePath("video", ownerId, clip.file);

  // Upload bytes
  await uploadToStorage(storagePath, clip.file);

  // Insert DB row
  const durationSeconds =
    typeof opts?.durationSeconds === "number"
      ? opts.durationSeconds
      : Math.max(0, clip.end - clip.start);

  const row = await insertMediaRow({
    ownerId,
    mediaType: "video",
    audience: form.audience,
    title: form.title,
    description: form.description,
    storagePath,
    durationSeconds,
    tags: form.tags ?? [],
  });

  opts?.onUploadProgress?.(100);
  return row;
}

// ----------------- IMAGES -----------------

export async function uploadSingleImage(
  file: File,
  form: ImageUploadFormValues,
  opts?: { onUploadProgress?: (pct: number) => void }
): Promise<InsertedMediaRow> {
  opts?.onUploadProgress?.(0);

  const ownerId = await requireUserId();
  const storagePath = makeStoragePath("image", ownerId, file);

  await uploadToStorage(storagePath, file);

  const row = await insertMediaRow({
    ownerId,
    mediaType: "image",
    audience: form.audience,
    title: form.title ?? file.name,
    description: form.description,
    storagePath,
    tags: form.tags ?? [],
  });

  opts?.onUploadProgress?.(100);
  return row;
}

export async function uploadImagesBatch(
  files: File[],
  form: ImageUploadFormValues
): Promise<{
  successes: { index: number; id: number; storage_path?: string | null }[];
  failures: { index: number; error: string }[];
}> {
  const successes: { index: number; id: number; storage_path?: string | null }[] =
    [];
  const failures: { index: number; error: string }[] = [];

  // Reuse the same user id for the whole batch
  const ownerId = await requireUserId();

  for (let i = 0; i < files.length; i++) {
    try {
      const file = files[i];
      const storagePath = makeStoragePath("image", ownerId, file);

      await uploadToStorage(storagePath, file);

      const row = await insertMediaRow({
        ownerId,
        mediaType: "image",
        audience: form.audience,
        title: form.title ?? file.name,
        description: form.description,
        storagePath,
        tags: form.tags ?? [],
      });

      successes.push({ index: i, id: row.id, storage_path: row.storage_path });
    } catch (e: any) {
      failures.push({ index: i, error: String(e?.message ?? e) });
    }
  }

  return { successes, failures };
}
