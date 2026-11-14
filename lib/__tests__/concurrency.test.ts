// @vitest-environment node
import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "@/lib/concurrency";

const tick = () => new Promise((resolve) => setTimeout(resolve, 1));

describe("mapWithConcurrency", () => {
  it("lässt höchstens `limit` Aufrufe gleichzeitig laufen und behält die Reihenfolge", async () => {
    let running = 0;
    let peak = 0;
    const results = await mapWithConcurrency([5, 1, 4, 2, 3, 0, 6], 2, async (value, index) => {
      running += 1;
      peak = Math.max(peak, running);
      for (let i = 0; i < value; i++) await tick();
      running -= 1;
      return `${index}:${value}`;
    });

    expect(peak).toBe(2);
    expect(results).toEqual(["0:5", "1:1", "2:4", "3:2", "4:3", "5:0", "6:6"]);
  });

  it("bricht beim ersten Fehler ab und startet keine weiteren Aufrufe", async () => {
    const started: number[] = [];
    const run = mapWithConcurrency([0, 1, 2, 3, 4, 5], 2, async (value) => {
      started.push(value);
      await tick();
      if (value === 1) throw new Error("kaputt");
      return value;
    });

    await expect(run).rejects.toThrow("kaputt");
    await tick();
    expect(started.length).toBeLessThan(6);
  });

  it("kommt mit einer leeren Liste aus", async () => {
    await expect(mapWithConcurrency([], 2, async () => 1)).resolves.toEqual([]);
  });
});
