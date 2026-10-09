import { NextResponse } from "next/server";
import { authenticate } from "@/lib/api/auth";
import { apiRoute, enforceRateLimit } from "@/lib/api/handler";
import { API_RATE_LIMITS } from "@/lib/api/limits";
import { exportUserData } from "@/lib/api/repository";

export const runtime = "nodejs";

/** All data stored about the signed-in user as a JSON download (GDPR Art. 15, 20). Session-only. */
export const GET = apiRoute(async (ctx) => {
  const principal = await authenticate(ctx, { sessionOnly: true });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  const data = await exportUserData(principal.userId);
  const date = data.exportedAt.slice(0, 10);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="auralens-daten-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
