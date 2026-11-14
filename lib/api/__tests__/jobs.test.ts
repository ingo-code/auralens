// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClaudeUsageEntry } from "@/lib/claude/usage";
import type { ProcessedImage } from "@/lib/image-processing";
import { VALID_STYLE_REPORT } from "@/lib/__tests__/fixtures/style-report";

const analyzeImageMock = vi.hoisted(() => vi.fn());
const repo = vi.hoisted(() => ({
  markJobRunning: vi.fn(),
  completeJob: vi.fn(),
  completeStep: vi.fn(),
  failJob: vi.fn(),
  saveJobUsage: vi.fn(),
}));

vi.mock("@/lib/api/repository", () => repo);
vi.mock("@/lib/services/image-analysis", () => ({ analyzeImage: analyzeImageMock }));
vi.mock("@/lib/api/background", () => ({ runInBackground: vi.fn() }));

const { processAnalysis } = await import("@/lib/api/jobs");

const IMAGE: ProcessedImage = { data: Buffer.from(""), mediaType: "image/jpeg", originalWidth: 10, originalHeight: 10 };

const USAGE: ClaudeUsageEntry = {
  part: "image",
  model: "claude-opus-5",
  inputTokens: 3000,
  outputTokens: 2500,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  ms: 1200,
};

describe("processAnalysis", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    repo.markJobRunning.mockResolvedValue(true);
    repo.completeJob.mockResolvedValue(true);
    repo.completeStep.mockResolvedValue(undefined);
    repo.failJob.mockResolvedValue(true);
    repo.saveJobUsage.mockResolvedValue(undefined);
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("speichert den Token-Verbrauch einer erfolgreichen Analyse", async () => {
    analyzeImageMock.mockImplementation(async (_image, _locale, options) => {
      options.onUsage(USAGE);
      return VALID_STYLE_REPORT;
    });

    await processAnalysis({ id: "job-ok", type: "image", locale: "de" }, [IMAGE]);

    expect(repo.completeJob).toHaveBeenCalledWith("job-ok", VALID_STYLE_REPORT);
    expect(repo.saveJobUsage).toHaveBeenCalledWith("job-ok", { parts: [USAGE] });
  });

  it("speichert den Verbrauch auch, wenn die Analyse danach scheitert", async () => {
    analyzeImageMock.mockImplementation(async (_image, _locale, options) => {
      options.onUsage(USAGE);
      throw new Error("kaputt");
    });

    await processAnalysis({ id: "job-fail", type: "image", locale: "de" }, [IMAGE]);

    expect(repo.failJob).toHaveBeenCalledWith("job-fail", "internal_error");
    expect(repo.saveJobUsage).toHaveBeenCalledWith("job-fail", { parts: [USAGE] });
  });

  it("lässt die Analyse nicht scheitern, wenn der Verbrauch nicht speicherbar ist", async () => {
    analyzeImageMock.mockImplementation(async (_image, _locale, options) => {
      options.onUsage(USAGE);
      return VALID_STYLE_REPORT;
    });
    repo.saveJobUsage.mockRejectedValue(new Error("db down"));

    await processAnalysis({ id: "job-db", type: "image", locale: "de" }, [IMAGE]);

    expect(repo.completeJob).toHaveBeenCalled();
    expect(repo.failJob).not.toHaveBeenCalled();
  });

  it("bricht nach dem Zeitlimit ab und erstattet sofort (processing_interrupted)", async () => {
    let receivedSignal: AbortSignal | undefined;
    // Behaves like the SDK: the request only ends when the signal aborts.
    analyzeImageMock.mockImplementation(
      (_image, _locale, options) =>
        new Promise((_resolve, reject) => {
          receivedSignal = options.signal;
          options.signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
        })
    );

    await processAnalysis({ id: "job-slow", type: "image", locale: "de", deadlineAt: Date.now() + 30 }, [IMAGE]);

    expect(receivedSignal?.aborted).toBe(true);
    expect(repo.failJob).toHaveBeenCalledWith("job-slow", "processing_interrupted");
    expect(repo.completeJob).not.toHaveBeenCalled();
  });

  it("bricht sofort ab, wenn das Zeitlimit schon beim Start abgelaufen ist", async () => {
    analyzeImageMock.mockImplementation(
      (_image, _locale, options) =>
        new Promise((_resolve, reject) => {
          if (options.signal.aborted) reject(new Error("Request was aborted."));
          options.signal.addEventListener("abort", () => reject(new Error("Request was aborted.")));
        })
    );

    await processAnalysis({ id: "job-late", type: "image", locale: "de", deadlineAt: Date.now() - 1000 }, [IMAGE]);

    expect(repo.failJob).toHaveBeenCalledWith("job-late", "processing_interrupted");
  });

  it("lässt höchstens 4 Analysen gleichzeitig laufen und rückt nach", async () => {
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
