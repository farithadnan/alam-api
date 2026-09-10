export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface HttpOpts {
  timeoutMs?: number;
  retries?: number;
  /** ms to wait before re-picking-up during a poll cycle. */
  headers?: Record<string, string>;
}

/** fetch with hard timeout + exponential backoff retries — shared by every adapter. */
export async function fetchJson<T>(
  url: string,
  { timeoutMs = 15_000, retries = 3, headers }: HttpOpts = {},
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { accept: "application/json", ...headers },
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return (await res.json()) as T;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(400 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
