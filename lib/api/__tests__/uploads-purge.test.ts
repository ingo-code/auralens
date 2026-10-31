import { beforeEach, describe, expect, it, vi } from "vitest";

const HOUR = 60 * 60 * 1000;
const NOW = 1_800_000_000_000;
const OLD = `${NOW - 2 * HOUR}-11111111-1111-1111-1111-111111111111`;
const FRESH = `${NOW - 10 * 60 * 1000}-22222222-2222-2222-2222-222222222222`;

// In-memory bucket: path -> object names (folders have id null, files an id).
const tree: Record<string, { name: string; id: string | null }[]> = {};
const removed: string[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({
    storage: {
      from: () => ({
        list: async (prefix: string) => ({ data: tree[prefix] ?? [], error: null }),
        remove: async (paths: string[]) => {
          removed.push(...paths);
          return { error: null };
        },
      }),
    },
  }),
}));

import { purgeAllStaleUploads } from "../uploads";

describe("purgeAllStaleUploads", () => {
  beforeEach(() => {
    removed.length = 0;
    for (const key of Object.keys(tree)) delete tree[key];
    tree[""] = [
      { name: "user-a", id: null },
      { name: "user-b", id: null },
      { name: "stray.jpg", id: "file-id" },
    ];
    tree["user-a"] = [
      { name: OLD, id: null },
      { name: FRESH, id: null },
    ];
    tree[`user-a/${OLD}`] = [{ name: "1-a.jpg", id: "x" }];
    tree["user-b"] = [{ name: OLD, id: null }];
    tree[`user-b/${OLD}`] = [
      { name: "1-b.jpg", id: "y" },
      { name: "2-c.png", id: "z" },
    ];
  });

  it("löscht abgelaufene Uploads aller Nutzer, lässt frische liegen", async () => {
    expect(await purgeAllStaleUploads(NOW)).toBe(2);
    expect(removed.sort()).toEqual([`user-a/${OLD}/1-a.jpg`, `user-b/${OLD}/1-b.jpg`, `user-b/${OLD}/2-c.png`]);
  });

  it("macht bei leerem Bucket nichts", async () => {
    tree[""] = [];
    expect(await purgeAllStaleUploads(NOW)).toBe(0);
    expect(removed).toEqual([]);
  });
});
