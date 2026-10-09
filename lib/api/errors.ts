import { NextResponse } from "next/server";

/**
 * Stable, machine-readable error codes of the public API. Clients branch on
 * these, so never rename one - only add new codes.
 */
export type ApiErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "invalid_request"
  | "payload_too_large"
  | "image_not_processable"
  | "insufficient_credits"
  | "idempotency_conflict"
  | "api_key_limit_reached"
  | "too_many_active_analyses"
  | "rate_limited"
  | "gone"
  | "method_not_allowed"
  | "internal_error";

/** Short English summaries, fixed per code (RFC 9457 `title`). */
const TITLES: Record<ApiErrorCode, string> = {
  unauthorized: "Authentication required",
  forbidden: "Permission denied",
  not_found: "Resource not found",
  invalid_request: "Invalid request",
  payload_too_large: "Payload too large",
  image_not_processable: "Image could not be processed",
  insufficient_credits: "Insufficient credits",
  idempotency_conflict: "Idempotency key reused with different content",
  api_key_limit_reached: "API key limit reached",
  too_many_active_analyses: "Too many active analyses",
  rate_limited: "Rate limit exceeded",
  gone: "Endpoint retired",
  method_not_allowed: "Method not allowed",
  internal_error: "Internal server error",
};

/** Throw from any API handler; `apiRoute` turns it into a problem response. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    /** Localized, human-readable explanation (RFC 9457 `detail`). */
    readonly detail: string,
    readonly headers?: Record<string, string>
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

/** Body of every API error response (`application/problem+json`, RFC 9457). */
export type ProblemDetails = {
  type: string;
  title: string;
  status: number;
  code: ApiErrorCode;
  detail: string;
  requestId: string;
};

export function problemResponse(error: ApiError, requestId: string): NextResponse<ProblemDetails> {
  return NextResponse.json<ProblemDetails>(
    {
      type: `urn:auralens:error:${error.code}`,
      title: TITLES[error.code],
      status: error.status,
      code: error.code,
      detail: error.detail,
      requestId,
    },
    { status: error.status, headers: { ...error.headers, "Content-Type": "application/problem+json" } }
  );
}
