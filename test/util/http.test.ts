import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fetchJson } from "../../src/util/http.js";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  statusText: String(status),
  headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  json: async () => body,
});

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe("fetchJson retry policy", () => {
  it("retries a 500 and then succeeds", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({}, 500)).mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal("fetch", f);
    await expect(fetchJson("https://example.test/a")).resolves.toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a 404 (it can never succeed)", async () => {
    const f = vi.fn().mockResolvedValue(json({}, 404));
    vi.stubGlobal("fetch", f);
    await expect(fetchJson("https://example.test/b")).rejects.toThrow(/404/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("retries a 429 and honours Retry-After", async () => {
    const f = vi.fn().mockResolvedValueOnce(json({}, 429, { "retry-after": "0" })).mockResolvedValueOnce(json({ ok: 1 }));
    vi.stubGlobal("fetch", f);
    await expect(fetchJson("https://example.test/c")).resolves.toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("gives up after the retry budget and surfaces the status", async () => {
    const f = vi.fn().mockResolvedValue(json({}, 429, { "retry-after": "0" }));
    vi.stubGlobal("fetch", f);
    await expect(fetchJson("https://example.test/d", { retries: 2 })).rejects.toThrow(/429/);
    expect(f).toHaveBeenCalledTimes(3); // 1 + 2 retries
  });

  it("sends a descriptive user-agent", async () => {
    const f = vi.fn().mockResolvedValue(json({}));
    vi.stubGlobal("fetch", f);
    await fetchJson("https://example.test/e");
    expect(f.mock.calls[0][1].headers["user-agent"]).toMatch(/alam-api/);
  });

  it("serialises concurrent calls to the same host (no bursting)", async () => {
    let inFlight = 0, maxInFlight = 0;
    const f = vi.fn().mockImplementation(async () => {
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return json({});
    });
    vi.stubGlobal("fetch", f);
    await Promise.all([fetchJson("https://same.test/1"), fetchJson("https://same.test/2"), fetchJson("https://same.test/3")]);
    expect(maxInFlight).toBe(1);
  });
});
