import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Daily keep-alive, called by Vercel Cron (see vercel.json). Supabase pauses
 * free-tier projects after about a week without activity; one tiny query a
 * day prevents that. Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || !isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const { error } = await getAdminClient().from("analysis_jobs").select("id").limit(1);
  if (error) {
    console.error("[cron] Supabase-Keep-alive fehlgeschlagen:", error.message);
    return NextResponse.json({ ok: false }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

function isAuthorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
