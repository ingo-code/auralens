import type { SupabaseClient } from "@supabase/supabase-js";
import type { StyleAnalysis } from "@/lib/analysis-schema";

const BUCKET = "analysis-images";

/**
 * Uploads the analyzed image and stores the report for a signed-in user.
 * Returns false (never throws) on failure so callers can treat persistence
 * as best-effort without risking the already-computed analysis response.
 */
export async function saveAnalysis(
  supabase: SupabaseClient,
  userId: string,
  imageBuffer: Buffer,
  report: StyleAnalysis
): Promise<boolean> {
  const imagePath = `${userId}/${crypto.randomUUID()}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(imagePath, imageBuffer, { contentType: "image/jpeg" });

  if (uploadError) {
    console.error("Speichern des Bildes fehlgeschlagen:", uploadError.message);
    return false;
  }

  const { error: insertError } = await supabase
    .from("analyses")
    .insert({ user_id: userId, image_path: imagePath, report });

  if (insertError) {
    console.error("Speichern der Analyse fehlgeschlagen:", insertError.message);
    await supabase.storage.from(BUCKET).remove([imagePath]);
    return false;
  }

  return true;
}
