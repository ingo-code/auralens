"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import type { ApiScope } from "@/lib/api/api-keys";
import type { ApiKeyResource, CreatedApiKeyResource, ListResource, UsageResource } from "@/lib/api/resources";
import { useI18n } from "@/lib/i18n/client";
import { INTL_LOCALES } from "@/lib/i18n/config";

const READ_WRITE: ApiScope[] = ["analyses:read", "analyses:write"];
const READ_ONLY: ApiScope[] = ["analyses:read"];

/** Reads an RFC 9457 problem body; falls back to the status code. */
async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body && typeof body.detail === "string" ? body.detail : `HTTP ${res.status}`;
    throw new Error(detail);
  }
  return body as T;
}

export function ApiKeysManager() {
  const { t, locale } = useI18n();
  const tk = t.apiKeys;

  const [keys, setKeys] = useState<ApiKeyResource[] | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<CreatedApiKeyResource | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [origin, setOrigin] = useState("https://<host>");

  const load = useCallback(async () => {
    try {
      const [list, usage] = await Promise.all([
        requestJson<ListResource<ApiKeyResource>>("/api/v1/api-keys"),
        requestJson<UsageResource>("/api/v1/usage"),
      ]);
      setKeys(list.data);
      setBalance(usage.credits.balance);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : tk.loadFailed);
    }
  }, [tk.loadFailed]);

  useEffect(() => {
    // Loading on mount is the point of this effect; the state updates land
    // after the fetches resolve, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setOrigin(window.location.origin);
  }, [load]);

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(INTL_LOCALES[locale], { day: "2-digit", month: "short", year: "numeric" });

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const created = await requestJson<CreatedApiKeyResource>("/api/v1/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: readOnly ? READ_ONLY : READ_WRITE }),
      });
      setNewKey(created);
      setCopied(false);
      setName("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : tk.loadFailed);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (confirmRevoke !== id) {
      setConfirmRevoke(id);
      return;
    }
    setConfirmRevoke(null);
    try {
      await requestJson<void>(`/api/v1/api-keys/${id}`, { method: "DELETE" });
      if (newKey?.id === id) setNewKey(null);
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : tk.loadFailed);
    }
  };

  const copyNewKey = async () => {
    if (!newKey) return;
    await navigator.clipboard.writeText(newKey.key);
    setCopied(true);
  };

  const quickstart =
    `curl -H "Authorization: Bearer al_live_…" \\\n  -F images=@bild1.jpg -F images=@bild2.jpg \\\n  ${origin}/api/v1/analyses\n\n` +
    `curl -H "Authorization: Bearer al_live_…" \\\n  ${origin}/api/v1/analyses/<id>`;

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-medium text-stone-500">{tk.creditsHeading}</h2>
        <p className="mt-2 text-4xl font-semibold tracking-tight" data-testid="credit-balance">
          {balance ?? "…"}
        </p>
        <p className="mt-2 text-sm text-stone-500">{tk.creditsUnit}</p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{tk.keysHeading}</h2>
        <p className="mt-1 text-sm text-stone-500">{tk.keysIntro}</p>

        <form onSubmit={handleCreate} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 text-sm">
            <span className="mb-1 block font-medium text-stone-700">{tk.nameLabel}</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={tk.namePlaceholder}
              maxLength={100}
              required
              className="w-full rounded-xl border border-stone-300 px-3 py-2 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-stone-700">{tk.scopeLabel}</span>
            <select
              value={readOnly ? "read" : "readwrite"}
              onChange={(event) => setReadOnly(event.target.value === "read")}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-200"
            >
              <option value="readwrite">{tk.scopeReadWrite}</option>
              <option value="read">{tk.scopeReadOnly}</option>
            </select>
          </label>
          <button
            type="submit"
            disabled={creating || name.trim().length === 0}
            className="rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {creating ? tk.creating : tk.create}
          </button>
        </form>

        {newKey && (
          <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-sm font-medium text-violet-900">{tk.newKeyTitle}</p>
            <p className="mt-1 text-xs text-violet-700">{tk.newKeyHint}</p>
            <div className="mt-3 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-sm ring-1 ring-violet-200">
                {newKey.key}
              </code>
              <button
                type="button"
                onClick={copyNewKey}
                className="rounded-lg bg-stone-900 px-3 py-2 text-sm text-white transition-colors hover:bg-stone-700"
              >
                {copied ? t.common.copied : t.common.copy}
              </button>
            </div>
          </div>
        )}

        <ul className="mt-5 divide-y divide-stone-100">
          {keys === null ? (
            <li className="py-3 text-sm text-stone-400">…</li>
          ) : keys.length === 0 ? (
            <li className="py-3 text-sm text-stone-500">{tk.empty}</li>
          ) : (
            keys.map((key) => (
              <li key={key.id} className="flex items-center justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{key.name}</p>
                  <p className="text-xs text-stone-500">
                    <code className="font-mono">{key.prefix}…</code> · {key.scopes.join(", ")} ·{" "}
                    {tk.createdAt(formatDate(key.createdAt))} ·{" "}
                    {key.lastUsedAt ? tk.lastUsed(formatDate(key.lastUsedAt)) : tk.neverUsed}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRevoke(key.id)}
                  className="shrink-0 text-xs text-stone-400 transition-colors hover:text-red-600"
                >
                  {confirmRevoke === key.id ? tk.revokeConfirm : tk.revoke}
                </button>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">{tk.quickstartHeading}</h2>
        <p className="mt-1 text-sm text-stone-500">{tk.quickstartIntro}</p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-stone-900 p-4 text-xs leading-relaxed text-stone-100">
          {quickstart}
        </pre>
      </section>
    </div>
  );
}
