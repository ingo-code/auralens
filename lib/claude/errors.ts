import Anthropic from "@anthropic-ai/sdk";
import type { Messages } from "@/lib/i18n";

/** Keys of all fixed (non-interpolated) error texts in the dictionaries. */
export type ErrorMessageKey = {
  [K in keyof Messages["errors"]]: Messages["errors"][K] extends string ? K : never;
}[keyof Messages["errors"]];

/**
 * Stable, machine-readable reasons an analysis can fail. Part of the public
 * API (`analysis.error.code`) - never rename, only add.
 */
export type AnalysisErrorCode =
  | "content_refused"
  | "analysis_truncated"
  | "invalid_ai_response"
  | "image_not_processable"
  | "upstream_rate_limited"
  | "upstream_unavailable"
  | "processing_interrupted"
  | "internal_error";

const CODE_BY_MESSAGE_KEY: Partial<Record<ErrorMessageKey, AnalysisErrorCode>> = {
  refusal: "content_refused",
  truncated: "analysis_truncated",
  unparsableReport: "invalid_ai_response",
  incompleteSeries: "invalid_ai_response",
  invalidAiResponse: "invalid_ai_response",
  imageNotProcessable: "image_not_processable",
};

/**
 * Domain error for failures the analysis service detects itself (refusals,
 * truncated or incomplete reports). Carries a dictionary key rather than a
 * text, so the route can answer in the requester's language.
 */
export class AnalysisError extends Error {
  constructor(
    readonly messageKey: ErrorMessageKey,
    readonly status: number
  ) {
    super(messageKey);
    this.name = "AnalysisError";
  }
}

export type MappedError = {
  status: number;
  message: string;
  code: AnalysisErrorCode;
};

/**
 * Translates any error thrown during a Claude analysis into an HTTP status,
 * a stable error code and a user-facing message in the request's language.
 * Logs the technical details server-side only.
 */
export function mapAnalysisError(error: unknown, t: Messages): MappedError {
  if (error instanceof AnalysisError) {
    return {
      status: error.status,
      message: t.errors[error.messageKey],
      code: CODE_BY_MESSAGE_KEY[error.messageKey] ?? "internal_error",
    };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    console.error("Claude API Authentifizierungsfehler:", error.message);
    return { status: 500, message: t.errors.authFailed, code: "internal_error" };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { status: 429, message: t.errors.claudeRateLimited, code: "upstream_rate_limited" };
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error("Claude API Bad Request:", error.message);
    // A rejected output schema is a deployment bug, not a bad upload - don't
    // tell the user to try another image when no image would ever work.
    if (/grammar|schema|output_config/i.test(error.message)) {
      return { status: 500, message: t.errors.internalConfig, code: "internal_error" };
    }
    // An exhausted Anthropic account balance also arrives as a 400 - it is an
    // operator problem, so the user must not be told their image is at fault.
    if (/credit balance|billing/i.test(error.message)) {
      return { status: 503, message: t.errors.claudeUnavailable, code: "upstream_unavailable" };
    }
    return { status: 400, message: t.errors.imageNotProcessable, code: "image_not_processable" };
  }
  if (error instanceof Anthropic.APIError) {
    console.error("Claude API Fehler:", error.status, error.message);
    return { status: 502, message: t.errors.claudeUnavailable, code: "upstream_unavailable" };
  }
  if (error instanceof Anthropic.AnthropicError) {
    // The SDK throws this same generic error both for missing/invalid
    // credentials and for a model response that fails structured-output
    // validation (e.g. a malformed hex code) - distinguish by message so
    // a transient parse hiccup isn't reported as a config problem.
    if (error.message.includes("Failed to parse structured output")) {
      console.error("Strukturierte Antwort ungültig:", error.message);
      return { status: 502, message: t.errors.invalidAiResponse, code: "invalid_ai_response" };
    }
    console.error("Anthropic SDK Konfigurationsfehler:", error.message);
    return { status: 500, message: t.errors.notConfigured, code: "internal_error" };
  }

  console.error("Unerwarteter Fehler bei der Bildanalyse:", error);
  return { status: 500, message: t.errors.unexpected, code: "internal_error" };
}
