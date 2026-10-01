import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const { data: analysis, error: fetchError } = await supabase
    .from("analyses")
    .select("image_path")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (fetchError || !analysis) {
    return NextResponse.json({ error: "Analyse nicht gefunden." }, { status: 404 });
  }

  await supabase.storage.from("analysis-images").remove([analysis.image_path]);

  const { error: deleteError } = await supabase
    .from("analyses")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (deleteError) {
    console.error("Löschen der Analyse fehlgeschlagen:", deleteError.message);
    return NextResponse.json({ error: "Löschen fehlgeschlagen." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
