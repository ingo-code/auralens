import type { JobListCursor } from "@/lib/api/repository";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Postgres timestamptz as PostgREST returns it, e.g. 2026-10-08T12:00:00.123456+00:00
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** Opaque cursor for keyset pagination (newest first). */
export function encodeCursor(cursor: JobListCursor): string {
  return Buffer.from(JSON.stringify([cursor.createdAt, cursor.id])).toString("base64url");
}

/**
 * Returns null for anything that isn't a cursor we issued. The values end up
 * in a PostgREST filter string, so they are checked against strict patterns
 * rather than just parsed.
 */
export function decodeCursor(value: string): JobListCursor | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [createdAt, id] = parsed;
    if (typeof createdAt !== "string" || !TIMESTAMP.test(createdAt)) return null;
    if (typeof id !== "string" || !UUID.test(id)) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}
