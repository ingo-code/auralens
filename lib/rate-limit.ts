type Bucket = {
  count: number;
  resetAt: number;
};

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
};

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

/**
 * In-memory fixed-window rate limiter, scoped to a single process.
 * Fine for a single-container deployment; on multi-instance hosts the
 * public API counts in Supabase instead (lib/api/handler.ts) and only
 * falls back to this.
 */
export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();

  if (Math.random() < 0.01) evictExpired(now);

  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { success: true, limit, remaining: limit - 1, resetAt };
  }

  if (bucket.count >= limit) {
    return { success: false, limit, remaining: 0, resetAt: bucket.resetAt };
  }

  bucket.count += 1;
  return { success: true, limit, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

function evictExpired(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Test-only: clears all buckets so tests don't leak state into each other. */
export function _resetRateLimitStore() {
  buckets.clear();
}

export function getClientIdentifier(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;

  return "unknown";
}
