import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { DeleteAnalysisButton } from "@/components/DeleteAnalysisButton";
import type { StyleAnalysis } from "@/lib/analysis-schema";

export default async function DashboardPage() {
  const supabase = await createClient();

  let userId: string | undefined;
  try {
    const { data: claims } = await supabase.auth.getClaims();
    userId = claims?.claims.sub;
  } catch (error) {
    console.error("Supabase-Sitzung konnte nicht geprüft werden:", error);
  }

  if (!userId) {
    redirect("/login");
  }

  const { data: analyses } = await supabase
    .from("analyses")
    .select("id, image_path, report, created_at")
    .order("created_at", { ascending: false });

  const items = await Promise.all(
    (analyses ?? []).map(async (row) => {
      const { data: signed } = await supabase.storage
        .from("analysis-images")
        .createSignedUrl(row.image_path as string, 60 * 60);

      return {
        id: row.id as string,
        createdAt: row.created_at as string,
        report: row.report as StyleAnalysis,
        imageUrl: signed?.signedUrl ?? null,
      };
    })
  );

  return (
    <div className="min-h-screen bg-black px-6 py-12 text-zinc-100">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">AuraLens</p>
            <h1 className="mt-2 text-2xl font-semibold">Meine Analysen</h1>
          </div>
          <Link href="/" className="text-sm text-zinc-400 transition-colors hover:text-zinc-200">
            Neue Analyse
          </Link>
        </div>

        {items.length === 0 ? (
          <p className="text-zinc-500">
            Noch keine gespeicherten Analysen. Lade auf der Startseite ein Bild hoch.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
              >
                {item.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- signierte Supabase-Storage-URL, kein optimierbares Remote-Bild
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-lg object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-zinc-500">
                    {new Date(item.createdAt).toLocaleString("de-DE")}
                  </p>
                  <p className="mt-1 line-clamp-2 text-sm text-zinc-300">
                    {item.report.style.summary}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {item.report.emotions.slice(0, 3).map((emotion) => (
                      <span
                        key={emotion}
                        className="rounded-full bg-violet-500/10 px-2 py-0.5 text-xs text-violet-200"
                      >
                        {emotion}
                      </span>
                    ))}
                  </div>
                </div>
                <DeleteAnalysisButton id={item.id} />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
