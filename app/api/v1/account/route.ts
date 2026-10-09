import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, readJsonBody } from "@/lib/api/handler";
import { API_RATE_LIMITS } from "@/lib/api/limits";
import { deleteUserAccount } from "@/lib/api/repository";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const DeleteAccountSchema = z.object({ confirmEmail: z.string().trim().min(1) });

/**
 * Deletes the signed-in account with all its data (GDPR Art. 17).
 * Session-only, and the account's e-mail address must be typed in as
 * confirmation, so neither an API key nor a stray request can trigger it.
 */
export const DELETE = apiRoute(async (ctx) => {
  const principal = await authenticate(ctx, { sessionOnly: true });
  await enforceRateLimit(ctx, `v1:write:${principal.userId}`, API_RATE_LIMITS.write);

  const parsed = DeleteAccountSchema.safeParse(await readJsonBody(ctx, 1024));
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email ?? "";
  if (!parsed.success || parsed.data.confirmEmail.toLowerCase() !== email.toLowerCase()) {
    throw new ApiError(400, "invalid_request", ctx.t.errors.accountDeleteConfirm);
  }

  await deleteUserAccount(principal.userId);
  console.info(`[api] request_id=${ctx.requestId} Konto gelöscht`);
  return new NextResponse(null, { status: 204 });
});
