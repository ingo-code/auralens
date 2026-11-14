/*
 * Token usage of Claude calls, stored per analysis job (column
 * `analysis_jobs.usage`, view `analysis_costs`) so the real cost per image
 * can be measured. Logs alone don't work for that: Vercel Hobby keeps them
 * only briefly.
 */

/** One Claude request (a series part or the single-image call). */
export type ClaudeUsageEntry = {
  part: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  ms: number;
};

/** Stored as `analysis_jobs.usage`. */
export type JobUsage = { parts: ClaudeUsageEntry[] };

/** Receives the usage of every Claude response, also of refused or truncated ones (they are billed too). */
export type UsageSink = (entry: ClaudeUsageEntry) => void;

/** The `usage` block of an Anthropic message; fields are optional so mocks and older SDKs fit. */
type MessageUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

export function toUsageEntry(
  part: string,
  model: string,
  usage: MessageUsage | null | undefined,
  startedAt: number
): ClaudeUsageEntry {
  return {
    part,
    model,
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    cacheReadTokens: usage?.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage?.cache_creation_input_tokens ?? 0,
    ms: Date.now() - startedAt,
  };
}

/** One log line per Claude call; the database row is the durable record. */
export function logUsage(scope: string, entry: ClaudeUsageEntry, stopReason: string | null | undefined): void {
  console.info(
    `[${scope}] part=${entry.part} model=${entry.model} stop=${stopReason} ` +
      `input_tokens=${entry.inputTokens} output_tokens=${entry.outputTokens} ` +
      `cache_read=${entry.cacheReadTokens} cache_write=${entry.cacheWriteTokens} ms=${entry.ms}`
  );
}
