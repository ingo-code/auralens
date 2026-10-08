import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/i18n";
import { localeFromRequest } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = getMessages(localeFromRequest(request));
  const { id } = await params;
  const supabase = await createClient();

  let userId: string | undefined;
  try {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims.sub;
  } catch (error) {
    console.error("Supabase-Sitzung konnte nicht geprüft werden:", error);
  }
  if (!userId) {
    return NextResponse.json({ error: t.errors.notSignedIn }, { status: 401 });
  }

  const { data: analysis, error: fetchError } = await supabase
    .from("analyses")
    .select("image_path")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (fetchError || !analysis) {
    return NextResponse.json({ error: t.errors.analysisNotFound }, { status: 404 });
  }

  await supabase.storage.from("analysis-images").remove([analysis.image_path]);

  const { error: deleteError } = await supabase
    .from("analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("Löschen der Analyse fehlgeschlagen:", deleteError.message);
    return NextResponse.json({ error: t.errors.deleteFailed }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
