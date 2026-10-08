import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { apiRoute, enforceRateLimit } from "@/lib/api/handler";
import { API_LIMITS, API_RATE_LIMITS } from "@/lib/api/limits";
import { failStaleJobs, getCreditBalance } from "@/lib/api/repository";
import type { UsageResource } from "@/lib/api/resources";

export const runtime = "nodejs";

/** Credit balance and limits, so integrations can check before uploading. */
export const GET = apiRoute(async (ctx) => {
  const principal = await authenticate(ctx, { scope: "analyses:read" });
  enforceRateLimit(ctx, `v1:read:${principal.userId}`, API_RATE_LIMITS.read);

  // Refunds of interrupted jobs must show up in the balance.
  await failStaleJobs(principal.userId);
  const balance = await getCreditBalance(principal.userId);

  return NextResponse.json<UsageResource>({
    object: "usage",
    credits: { balance, costPerImage: API_LIMITS.creditsPerImage },
    limits: {
      maxImagesPerAnalysis: API_LIMITS.maxImagesPerAnalysis,
      maxImageBytes: API_LIMITS.maxImageBytes,
      maxTotalUploadBytes: API_LIMITS.maxTotalUploadBytes,
      maxActiveAnalyses: API_LIMITS.maxActiveAnalyses,
    },
  });
});
