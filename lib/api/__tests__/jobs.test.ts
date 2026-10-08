// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { ProcessedImage } from "@/lib/image-processing";
import { VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";

const analyzeImageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api/repository", () => ({
  markJobRunning: vi.fn().mockResolvedValue(true),
  completeJob: vi.fn().mockResolvedValue(true),
  completeStep: vi.fn().mockResolvedValue(undefined),
  failJob: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/services/image-analysis", () => ({ analyzeImage: analyzeImageMock }));
vi.mock("@/lib/api/background", () => ({ runInBackground: vi.fn() }));

const { processAnalysis } = await import("@/lib/api/jobs");

const IMAGE: ProcessedImage = { data: Buffer.from(""), mediaType: "image/jpeg", originalWidth: 10, originalHeight: 10 };

describe("processAnalysis", () => {
  it("lässt höchstens 4 Analysen gleichzeitig laufen und rückt nach", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const pending: (() => void)[] = [];
    analyzeImageMock.mockImplementation(
      () => new Promise((resolve) => pending.push(() => resolve(VALID_STYLE_REPORT)))
    );

    const runs = Array.from({ length: 6 }, (_, i) =>
      processAnalysis({ id: `job-${i}`, type: "image", locale: "de" }, [IMAGE])
    );
    await vi.waitFor(() => expect(analyzeImageMock).toHaveBeenCalledTimes(4));

    pending[0]();
    await vi.waitFor(() => expect(analyzeImageMock).toHaveBeenCalledTimes(5));

    pending.slice(1).forEach((resolve) => resolve());
    await vi.waitFor(() => expect(analyzeImageMock).toHaveBeenCalledTimes(6));
    pending.forEach((resolve) => resolve());
    await Promise.all(runs);
  });
});
