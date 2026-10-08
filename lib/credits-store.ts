"use client";

import { useEffect, useSyncExternalStore } from "react";
import { ApiProblem, fetchUsage } from "@/lib/api-client";
import { getMessages } from "@/lib/i18n";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";

/*
 * One credit balance for the whole page, so the header badge and the
 * analysis pages agree and update together after an analysis starts or
 * finishes. Fetched from GET /api/v1/usage; 401 means "signed out".
 */

export type CreditsState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "ready"; balance: number }
  | { status: "error" };

let state: CreditsState = { status: "loading" };
let inFlight: Promise<void> | null = null;
let loadedOnce = false;
const listeners = new Set<() => void>();

function setState(next: CreditsState) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-reads the balance; concurrent calls share one request. */
export function refreshCredits(): Promise<void> {
  inFlight ??= fetchUsage(getMessages(DEFAULT_LOCALE))
    .then((usage) => setState({ status: "ready", balance: usage.credits.balance }))
    .catch((error: unknown) => {
      setState(error instanceof ApiProblem && error.status === 401 ? { status: "signed-out" } : { status: "error" });
    })
    .finally(() => {
      inFlight = null;
      loadedOnce = true;
    });
  return inFlight;
}

const SERVER_STATE: CreditsState = { status: "loading" };
const getSnapshot = () => state;
const getServerSnapshot = () => SERVER_STATE;

/** Current balance; loads it on first use. */
export function useCredits(): CreditsState {
  const current = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (!loadedOnce) void refreshCredits();
  }, []);
  return current;
}

/** Test-only: forget the cached balance. */
export function _resetCreditsStore() {
  state = { status: "loading" };
  inFlight = null;
  loadedOnce = false;
}
