import { NextResponse } from "next/server";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { apiRoute, enforceRateLimit, methodNotAllowed, readJsonBody } from "@/lib/api/handler";
import { API_RATE_LIMITS } from "@/lib/api/limits";
import { isInviteCodeAvailable } from "@/lib/api/repository";
import { looksLikeInviteCode } from "@/lib/invite-codes";
import { getClientIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";

const BodySchema = z.object({ code: z.string().max(100) });

/**
 * Checks an invite code before sign-up, so the form can answer "invalid or
 * already used" with a clear 400 instead of Supabase's generic database
 * error. No authentication (the caller has no account yet); a tight per-IP
 * limit makes guessing codes pointless. Claiming happens atomically in the
 * database during sign-up, never here.
 */
export const POST = apiRoute(async (ctx) => {
  await enforceRateLimit(ctx, `v1:invite:${getClientIdentifier(ctx.request.headers)}`, API_RATE_LIMITS.inviteCheck);

  const parsed = BodySchema.safeParse(await readJsonBody(ctx, 1024));
  const code = parsed.success ? parsed.data.code : "";
  if (!looksLikeInviteCode(code) || !(await isInviteCodeAvailable(code))) {
    throw new ApiError(400, "invalid_invite_code", ctx.t.errors.inviteCodeInvalid);
  }

  return NextResponse.json({ object: "invite_code_check", valid: true }, { headers: { "Cache-Control": "no-store" } });
});

export const { GET, PUT, PATCH, DELETE } = methodNotAllowed("POST");
