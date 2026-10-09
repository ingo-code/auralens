import { randomUUID } from "node:crypto";
import { getAdminClient } from "@/lib/supabase/admin";

/*
 * Transit storage for analysis images (bucket `analysis-uploads`, see the
 * 20261009200000 migration). Serverless hosts cap request bodies (Vercel:
 * 4.5 MB), so clients upload originals directly to Supabase Storage through
 * signed URLs and only send the object paths to POST /api/v1/analyses.
 *
 * Objects live under `<userId>/<createdAtMs>-<uuid>/<index>-<name>`. They are
 * deleted right after the server has read them; abandoned batches are purged
 * after UPLOAD_TTL_MS. Runs with the service role, so every function takes
 * the user id and only touches that user's folder.
 */

export const UPLOAD_BUCKET = "analysis-uploads";
/** Abandoned uploads (never analyzed) are deleted after this long. */
export const UPLOAD_TTL_MS = 60 * 60 * 1000;

export type UploadSlot = {
  index: number;
  name: string;
  path: string;
  uploadUrl: string;
  token: string;
};

export type DownloadedUpload = { path: string; name: string; file: File };

const BATCH_PATTERN = /^(\d{13})-[0-9a-f-]{36}$/;

function storage() {
  return getAdminClient().storage.from(UPLOAD_BUCKET);
}

/** Object keys must stay ASCII-safe; the original name travels separately. */
function safeObjectName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "image").slice(-100);
}

/** Creates one signed upload URL per file, all in a fresh batch folder. */
export async function createUploadSlots(userId: string, names: string[]): Promise<UploadSlot[]> {
  const batch = `${Date.now()}-${randomUUID()}`;
  return Promise.all(
    names.map(async (name, i) => {
      const path = `${userId}/${batch}/${i + 1}-${safeObjectName(name)}`;
      const { data, error } = await storage().createSignedUploadUrl(path);
      if (error || !data) throw new Error(`[uploads] createSignedUploadUrl: ${error?.message}`);
      return { index: i + 1, name, path, uploadUrl: data.signedUrl, token: data.token };
    })
  );
}

/** True when `path` is an upload slot of this user (never trust client paths). */
export function isOwnUploadPath(userId: string, path: string): boolean {
  const parts = path.split("/");
  return (
    parts.length === 3 &&
    parts[0] === userId &&
    BATCH_PATTERN.test(parts[1]) &&
    /^\d{1,2}-[A-Za-z0-9._-]{1,100}$/.test(parts[2])
  );
}

export class UploadNotFoundError extends Error {
  constructor(readonly path: string) {
    super(`upload not found: ${path}`);
    this.name = "UploadNotFoundError";
  }
}

/** Downloads uploaded objects; throws UploadNotFoundError for a missing one. */
export async function downloadUploads(uploads: { path: string; name: string }[]): Promise<DownloadedUpload[]> {
  return Promise.all(
    uploads.map(async ({ path, name }) => {
      const { data, error } = await storage().download(path);
      if (error || !data) throw new UploadNotFoundError(path);
      return { path, name, file: new File([data], name, { type: data.type }) };
    })
  );
}

/** Best effort: a failed delete is logged, the hourly purge catches it later. */
export async function removeUploads(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await storage().remove(paths);
  if (error) console.error("[uploads] remove fehlgeschlagen:", error.message);
}

async function removeBatches(userId: string, keep: (batch: string) => boolean): Promise<void> {
  const { data: batches, error } = await storage().list(userId, { limit: 1000 });
  if (error) throw new Error(`[uploads] list: ${error.message}`);
  for (const batch of batches ?? []) {
    if (keep(batch.name)) continue;
    const folder = `${userId}/${batch.name}`;
    const { data: objects, error: listError } = await storage().list(folder, { limit: 100 });
    if (listError) throw new Error(`[uploads] list(${folder}): ${listError.message}`);
    await removeUploads((objects ?? []).map((object) => `${folder}/${object.name}`));
  }
}

/** Deletes this user's upload batches older than UPLOAD_TTL_MS. */
export async function purgeStaleUploads(userId: string, now = Date.now()): Promise<void> {
  await removeBatches(userId, (batch) => {
    const createdAt = Number(BATCH_PATTERN.exec(batch)?.[1]);
    return Number.isFinite(createdAt) && now - createdAt < UPLOAD_TTL_MS;
  });
}

/** Deletes every upload of this user (account deletion). */
export async function removeAllUploads(userId: string): Promise<void> {
  await removeBatches(userId, () => false);
}
