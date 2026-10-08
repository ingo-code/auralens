import { after } from "next/server";

/**
 * Runs work after the response has been sent, inside the same server
 * process (Next.js `after`). Bounded by the route's `maxDuration` on
 * serverless platforms; unbounded on the self-hosted Docker server.
 * Kept in its own module so tests can run the task synchronously.
 */
export function runInBackground(task: () => Promise<void>): void {
  after(task);
}
