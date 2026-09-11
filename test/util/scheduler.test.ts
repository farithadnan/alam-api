import { describe, expect, it } from "vitest";
import { mapLimit } from "../../src/scheduler.js";

const after = (ms: number, v: number) => new Promise<number>((r) => setTimeout(() => r(v), ms));

describe("mapLimit — bounded concurrency for the poll cycle", () => {
  it("returns every result in input order", async () => {
    const out = await mapLimit([30, 5, 15], 3, (ms) => after(ms, ms));
    expect(out).toEqual([30, 5, 15]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0, peak = 0;
    const task = async () => {
      inFlight++; peak = Math.max(peak, inFlight);
      await after(10, 1);
      inFlight--;
      return 1;
    };
    await mapLimit([0, 1, 2, 3, 4, 5, 6, 7], 3, task);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1); // and it really does run in parallel
  });

  it("runs faster than sequential when there is room", async () => {
    const started = Date.now();
    await mapLimit([0, 1, 2, 3], 4, () => after(40, 1));
    expect(Date.now() - started).toBeLessThan(120); // sequential would be ~160ms
  });

  it("handles an empty list and a limit larger than the list", async () => {
    expect(await mapLimit([], 4, async () => 1)).toEqual([]);
    expect(await mapLimit([1, 2], 99, async (n) => n * 2)).toEqual([2, 4]);
  });
});
