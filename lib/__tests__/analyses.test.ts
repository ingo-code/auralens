import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { saveAnalysis } from "@/lib/analyses";
import type { StyleAnalysis } from "@/lib/analysis-schema";

const REPORT: StyleAnalysis = {
  style: { summary: "Ruhige Bildsprache.", tags: ["minimalistisch", "ruhig", "warm"] },
  colorPalette: [
    { hex: "#111111", name: "A" },
    { hex: "#222222", name: "B" },
    { hex: "#333333", name: "C" },
  ],
  emotions: ["Ruhe"],
  midjourneyPrompt: "a calm gradient",
};

function buildSupabaseMock(options: {
  uploadError?: { message: string } | null;
  insertError?: { message: string } | null;
}) {
  const remove = vi.fn();
  const upload = vi.fn().mockResolvedValue({ error: options.uploadError ?? null });
  const insert = vi.fn().mockResolvedValue({ error: options.insertError ?? null });

  const client = {
    storage: { from: () => ({ upload, remove }) },
    from: () => ({ insert }),
  } as unknown as SupabaseClient;

  return { client, upload, insert, remove };
}

describe("saveAnalysis", () => {
  it("lädt das Bild hoch und speichert die Analyse bei Erfolg", async () => {
    const { client, upload, insert } = buildSupabaseMock({});
    const result = await saveAnalysis(client, "user-1", Buffer.from("x"), REPORT);

    expect(result).toBe(true);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", report: REPORT })
    );
  });

  it("gibt false zurück und überspringt den Insert, wenn der Bild-Upload fehlschlägt", async () => {
    const { client, insert } = buildSupabaseMock({ uploadError: { message: "boom" } });
    const result = await saveAnalysis(client, "user-1", Buffer.from("x"), REPORT);

    expect(result).toBe(false);
    expect(insert).not.toHaveBeenCalled();
  });

  it("räumt das hochgeladene Bild auf, wenn das Speichern der Analyse fehlschlägt", async () => {
    const { client, remove } = buildSupabaseMock({ insertError: { message: "boom" } });
    const result = await saveAnalysis(client, "user-1", Buffer.from("x"), REPORT);

    expect(result).toBe(false);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
