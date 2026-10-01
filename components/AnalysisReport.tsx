"use client";

import { useState } from "react";
import type { StyleAnalysis } from "@/lib/analysis-schema";

type AnalysisReportProps = {
  report: StyleAnalysis;
};

export function AnalysisReport({ report }: AnalysisReportProps) {
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(report.imagePrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard-Zugriff kann z. B. ohne sicheren Kontext fehlschlagen.
    }
  };

  return (
    <div className="w-full space-y-8 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">Stil</h2>
        <p className="mt-2 text-lg leading-relaxed text-zinc-100">{report.style.summary}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.style.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-zinc-700 bg-zinc-800/60 px-3 py-1 text-xs text-zinc-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">Farbpalette</h2>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {report.colorPalette.map((color) => (
            <div
              key={color.hex}
              className="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-2"
            >
              <span
                className="h-8 w-8 shrink-0 rounded-md border border-white/10"
                style={{ backgroundColor: color.hex }}
                aria-hidden="true"
              />
              <div className="min-w-0">
                <p className="truncate text-sm text-zinc-200">{color.name}</p>
                <p className="font-mono text-xs text-zinc-500">{color.hex}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">Emotionen</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {report.emotions.map((emotion) => (
            <span
              key={emotion}
              className="rounded-full bg-violet-500/10 px-3 py-1 text-xs text-violet-200"
            >
              {emotion}
            </span>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-violet-300">
            Bild-Prompt (Stable Diffusion / FLUX)
          </h2>
          <button
            type="button"
            onClick={copyPrompt}
            className="text-xs font-medium text-zinc-400 transition-colors hover:text-violet-300"
          >
            {copied ? "Kopiert!" : "Kopieren"}
          </button>
        </div>
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-zinc-800 bg-black/60 p-4 font-mono text-sm text-zinc-300">
          {report.imagePrompt}
        </pre>
        <p className="mt-2 text-xs text-zinc-500">
          Funktioniert mit kostenlosen Tools wie Hugging Face Spaces (FLUX.1-schnell) oder lokal
          über ComfyUI/Automatic1111.
        </p>
      </section>
    </div>
  );
}
