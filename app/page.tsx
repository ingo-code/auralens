"use client";

import { useCallback, useState } from "react";
import { ImageDropzone } from "@/components/ImageDropzone";
import { AnalysisReport } from "@/components/AnalysisReport";
import { AuthStatus } from "@/components/AuthStatus";
import type { StyleAnalysis } from "@/lib/analysis-schema";

type Status = "idle" | "loading" | "success" | "error";

export default function Home() {
  const [status, setStatus] = useState<Status>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [report, setReport] = useState<StyleAnalysis | null>(null);
  const [persisted, setPersisted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeImage = useCallback(async (file: File) => {
    setStatus("loading");
    setError(null);
    setReport(null);
    setPersisted(false);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return URL.createObjectURL(file);
    });

    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Analyse fehlgeschlagen.");
      }

      setReport(data.report as StyleAnalysis);
      setPersisted(Boolean(data.persisted));
      setStatus("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler bei der Analyse.");
      setStatus("error");
    }
  }, []);

  const reset = () => {
    setStatus("idle");
    setReport(null);
    setPersisted(false);
    setError(null);
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
  };

  return (
    <div className="flex min-h-screen flex-col bg-black text-zinc-100">
      <nav className="mx-auto flex w-full max-w-4xl justify-end px-6 pt-6">
        <AuthStatus />
      </nav>

      <header className="mx-auto w-full max-w-4xl px-6 pt-10 text-center sm:pt-16">
        <p className="text-sm font-medium uppercase tracking-[0.2em] text-violet-400">AuraLens</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Der visuelle Stil- &amp; Storytelling-Analyst für deine Fotografie
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-zinc-400">
          Lade ein Bild hoch und erhalte in Sekunden einen KI-Report zu Stil, Farbpalette,
          Emotionen und einem passenden Bild-Prompt für Stable Diffusion/FLUX.
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-8 px-6 py-12">
        <ImageDropzone onFileSelected={analyzeImage} disabled={status === "loading"} />

        {previewUrl && (
          <div className="flex w-full items-center gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element -- Objekt-URL einer lokalen Datei, kein optimierbares Remote-Bild */}
            <img
              src={previewUrl}
              alt="Vorschau des hochgeladenen Bildes"
              className="h-20 w-20 rounded-lg object-cover"
            />
            <div className="min-w-0 flex-1">
              {status === "loading" && <p className="text-sm text-zinc-400">Analysiere Bild…</p>}
              {status === "success" && (
                <p className="text-sm text-emerald-400">
                  Analyse abgeschlossen
                  {persisted && " · in deiner Historie gespeichert"}
                </p>
              )}
              {status === "error" && <p className="text-sm text-red-400">{error}</p>}
            </div>
            <button
              type="button"
              onClick={reset}
              className="shrink-0 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
            >
              Zurücksetzen
            </button>
          </div>
        )}

        {report && <AnalysisReport report={report} />}
      </main>

      <footer className="mx-auto w-full max-w-3xl px-6 pb-10 text-center text-xs text-zinc-600">
        Analyse powered by Claude Vision
      </footer>
    </div>
  );
}
