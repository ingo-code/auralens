"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n/client";

type CreditsExhaustedDialogProps = {
  /** Server detail, e.g. "Nicht genug Credits: benötigt 4, verfügbar 1." */
  detail: string;
  onClose: () => void;
};

/** Modal shown when starting an analysis is refused with 402. */
export function CreditsExhaustedDialog({ detail, onClose }: CreditsExhaustedDialogProps) {
  const { t } = useI18n();
  const labels = t.analysis.creditsExhausted;
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="credits-exhausted-title"
        aria-describedby="credits-exhausted-body"
        className="w-full max-w-md border border-hairline bg-panel p-6 shadow-xl sm:p-8"
      >
        <div className="mb-4 flex h-12 w-12 items-center justify-center bg-panel-high text-2xl">
          <span aria-hidden="true">✦</span>
        </div>
        <h2 id="credits-exhausted-title" className="text-xl text-stone-900">
          {labels.title}
        </h2>
        <div id="credits-exhausted-body" className="mt-2 space-y-2 text-sm text-stone-600">
          <p className="font-medium text-stone-800">{detail}</p>
          <p>{labels.body}</p>
        </div>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-100 hover:text-stone-900"
          >
            {labels.close}
          </button>
          <Link
            href="/dashboard"
            className="rounded-xl bg-signal px-4 py-2 text-center text-sm font-medium text-white transition hover:brightness-110"
          >
            {labels.dashboard}
          </Link>
        </div>
      </div>
    </div>
  );
}
