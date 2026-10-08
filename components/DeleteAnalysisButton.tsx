"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";

type DeleteAnalysisButtonProps = {
  id: string;
  /** "v1" for analyses from the public API, "legacy" for the old history. */
  kind?: "v1" | "legacy";
};

export function DeleteAnalysisButton({ id, kind = "legacy" }: DeleteAnalysisButtonProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const handleDelete = async () => {
    // Two clicks instead of a browser confirm() dialog.
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setLoading(true);
    const url = kind === "v1" ? `/api/v1/analyses/${id}` : `/api/analyses/${id}`;
    const res = await fetch(url, { method: "DELETE" });
    setLoading(false);
    setConfirming(false);
    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      onBlur={() => setConfirming(false)}
      disabled={loading}
      className={`self-start text-xs transition-colors disabled:opacity-50 ${
        confirming ? "text-red-600" : "text-stone-400 hover:text-red-600"
      }`}
    >
      {loading ? "…" : confirming ? t.dashboard.deleteConfirm : t.common.delete}
    </button>
  );
}
