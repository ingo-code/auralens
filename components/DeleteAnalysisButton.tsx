"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteAnalysisButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    const res = await fetch(`/api/analyses/${id}`, { method: "DELETE" });
    setLoading(false);
    if (res.ok) {
      router.refresh();
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={loading}
      className="self-start text-xs text-zinc-600 transition-colors hover:text-red-400 disabled:opacity-50"
    >
      {loading ? "…" : "Löschen"}
    </button>
  );
}
