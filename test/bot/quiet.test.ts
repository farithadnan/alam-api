import { describe, expect, it } from "vitest";
import { malaysiaHour, quietActive } from "../../src/bot/notifier.js";

/** A timestamp whose Malaysia-local (UTC+8) hour is `h`. */
const myHour = (h: number): number => Date.UTC(2026, 0, 5, (h - 8 + 24) % 24);

describe("quiet hours (Malaysia local time)", () => {
  it("gates a window that crosses midnight (23:00-07:00 default)", () => {
    expect(quietActive(myHour(1), 23, 7)).toBe(true); // 1am
    expect(quietActive(myHour(6), 23, 7)).toBe(true); // 6am
    expect(quietActive(myHour(23), 23, 7)).toBe(true); // 11pm
    expect(quietActive(myHour(12), 23, 7)).toBe(false); // noon: alerting
  });

  it("gates a same-day window (e.g. 2:00-6:00)", () => {
    expect(quietActive(myHour(3), 2, 6)).toBe(true);
    expect(quietActive(myHour(1), 2, 6)).toBe(false);
    expect(quietActive(myHour(6), 2, 6)).toBe(false); // end is exclusive
    expect(quietActive(myHour(12), 2, 6)).toBe(false);
  });

  it("is never quiet when start equals end", () => {
    expect(quietActive(myHour(23), 23, 23)).toBe(false);
    expect(quietActive(myHour(5), 23, 23)).toBe(false);
  });

  it("reports the Malaysia hour in the stated offset", () => {
    expect(malaysiaHour(myHour(16))).toBe(16);
    expect(malaysiaHour(Date.UTC(2026, 0, 5, 2))).toBe(10); // 02:00 UTC = 10:00 MY
  });
});
