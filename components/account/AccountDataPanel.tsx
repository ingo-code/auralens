"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/lib/i18n/client";
import { createClient } from "@/lib/supabase/client";

/** Self-service for GDPR Art. 15/20 (export) and Art. 17 (deletion). */
export function AccountDataPanel({ email }: { email: string }) {
  const { t } = useI18n();
  const labels = t.account;
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const problemText = async (res: Response) => {
    const body = await res.json().catch(() => null);
    return typeof body?.detail === "string" ? body.detail : t.errors.unexpectedResponse(res.status, "");
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/account/export");
      if (!res.ok) throw new Error(await problemText(res));
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `auralens-daten-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : t.errors.serverUnreachable);
    } finally {
      setExporting(false);
    }
  };

  const handleDelete = async (event: FormEvent) => {
    event.preventDefault();
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmEmail }),
      });
      if (!res.ok) throw new Error(await problemText(res));
      // The account is gone server-side; drop the local session cookie too.
      await createClient().auth.signOut();
      router.push("/");
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t.errors.serverUnreachable);
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{labels.exportHeading}</h2>
        <p className="mt-1 text-sm text-stone-600">{labels.exportText}</p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="mt-4 rounded-xl bg-stone-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-stone-700 disabled:opacity-50"
        >
          {exporting ? labels.exporting : labels.exportButton}
        </button>
      </section>

      <section className="rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-red-800">{labels.deleteHeading}</h2>
        <p className="mt-1 text-sm text-stone-600">{labels.deleteText}</p>
        <form onSubmit={handleDelete} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block text-stone-700">{labels.deleteConfirmLabel}</span>
            <input
              type="email"
              value={confirmEmail}
              onChange={(event) => setConfirmEmail(event.target.value)}
              placeholder={email}
              autoComplete="off"
              className="w-full rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
            />
          </label>
          <button
            type="submit"
            disabled={deleting || confirmEmail.trim().toLowerCase() !== email.toLowerCase()}
            className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? labels.deleting : labels.deleteButton}
          </button>
        </form>
      </section>
    </div>
  );
}
