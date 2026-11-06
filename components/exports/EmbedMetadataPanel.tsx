"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { downloadBlob, todayStamp } from "@/lib/download";
import { buildXmpSidecar, embedMetadataInJpeg, isJpeg } from "@/lib/embedded-metadata";
import { useI18n } from "@/lib/i18n/client";
import { stockToEmbeddable } from "@/lib/report-package";
import type { StockMetadata } from "@/lib/series-analysis-schema";
import { createZip, uniquePath, type ZipEntry } from "@/lib/zip";

export type EmbedEntry = { label: string; filename?: string; stock: StockMetadata };

function stem(filename: string): string {
  const name = filename.split(/[\\/]/).pop() ?? filename;
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase();
}

/**
 * Matches chosen originals to report entries by file name without extension
 * (the analyzed upload may be a smaller export of the same original). A
 * single-image report accepts any one file.
 */
export function matchOriginals<T extends { name: string }>(
  files: T[],
  entries: EmbedEntry[]
): { matched: { file: T; entry: EmbedEntry }[]; unmatched: T[] } {
  if (entries.length === 1 && !entries[0].filename) {
    return { matched: files.slice(0, 1).map((file) => ({ file, entry: entries[0] })), unmatched: files.slice(1) };
  }
  const byStem = new Map(entries.filter((e) => e.filename).map((e) => [stem(e.filename!), e]));
  const matched: { file: T; entry: EmbedEntry }[] = [];
  const unmatched: T[] = [];
  for (const file of files) {
    const entry = byStem.get(stem(file.name)) ?? (entries.length === 1 ? entries[0] : undefined);
    if (entry) matched.push({ file, entry });
    else unmatched.push(file);
  }
  return { matched, unmatched };
}

type Outcome = { done: number; unmatched: string[]; notJpeg: string[]; failed: string[] };

/**
 * Writes the stock metadata into the user's original JPEGs, in the browser.
 * The originals are read locally and never uploaded.
 */
export function EmbedMetadataPanel({ entries }: { entries: EmbedEntry[] }) {
  const { t } = useI18n();
  const e = t.exports.embed;
  const inputRef = useRef<HTMLInputElement>(null);
  const [working, setWorking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const single = entries.length === 1;

  const onFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;
    setWorking(true);
    setOutcome(null);

    const { matched, unmatched } = matchOriginals(files, entries);
    const result: Outcome = { done: 0, unmatched: unmatched.map((f) => f.name), notJpeg: [], failed: [] };
    const outputs: ZipEntry[] = [];
    const used = new Set<string>();

    for (const { file, entry } of matched) {
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isJpeg(bytes)) {
          result.notJpeg.push(file.name);
          continue;
        }
        outputs.push({ path: uniquePath(file.name, used), data: embedMetadataInJpeg(bytes, stockToEmbeddable(entry.stock)) });
      } catch (error) {
        console.error(`Metadaten für ${file.name} nicht schreibbar:`, error);
        result.failed.push(file.name);
      }
    }

    if (outputs.length === 1) {
      downloadBlob(outputs[0].data as BlobPart, outputs[0].path, "image/jpeg");
    } else if (outputs.length > 1) {
      downloadBlob(createZip(outputs) as BlobPart, `auralens-metadaten-${todayStamp()}.zip`, "application/zip");
    }
    result.done = outputs.length;
    setOutcome(result);
    setWorking(false);
  };

  const downloadSidecars = () => {
    const used = new Set<string>();
    const sidecars = entries.map((entry, i) => ({
      path: uniquePath(`${entry.filename ? entry.filename.replace(/\.[^.]+$/, "") : `image-${i + 1}`}.xmp`, used),
      data: buildXmpSidecar(stockToEmbeddable(entry.stock)),
    }));
    if (sidecars.length === 1) downloadBlob(sidecars[0].data, sidecars[0].path, "application/rdf+xml");
    else downloadBlob(createZip(sidecars) as BlobPart, `auralens-xmp-${todayStamp()}.zip`, "application/zip");
  };

  return (
    <div className="space-y-3 border border-hairline p-3 text-xs">
      <p className="text-sm font-medium text-ink">{e.heading}</p>
      <p className="text-ink-muted">{e.intro}</p>
      <p className="text-ink-muted">{e.portals}</p>
      {!single && <p className="text-ink-muted">{e.matchHint}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,.jpg,.jpeg"
          multiple={!single}
          className="hidden"
          onChange={(event) => void onFiles(event)}
          data-testid="embed-input"
        />
        <button
          type="button"
          disabled={working}
          onClick={() => inputRef.current?.click()}
          className="bg-signal px-3 py-1.5 font-semibold text-on-signal transition-colors hover:bg-signal-soft disabled:opacity-60"
        >
          {working ? e.working : single ? e.chooseOne : e.choose}
        </button>
      </div>
      {outcome && (
        <div role="status" className="space-y-1">
          {outcome.done > 0 && <p className="text-emerald-700">{e.done(outcome.done)}</p>}
          {outcome.unmatched.length > 0 && <p className="text-amber-700">{e.unmatched(outcome.unmatched.join(", "))}</p>}
          {outcome.notJpeg.length > 0 && <p className="text-amber-700">{e.notJpeg(outcome.notJpeg.join(", "))}</p>}
          {outcome.failed.length > 0 && <p className="text-red-700">{e.failed(outcome.failed.join(", "))}</p>}
        </div>
      )}

      <div className="space-y-2 border-t border-hairline pt-3">
        <p className="font-medium text-ink">{e.sidecarHeading}</p>
        <p className="text-ink-muted">{e.sidecarHint}</p>
        <button
          type="button"
          onClick={downloadSidecars}
          className="border border-hairline px-3 py-1.5 text-ink transition-colors hover:bg-panel-high"
        >
          {e.sidecarButton}
        </button>
      </div>
    </div>
  );
}
