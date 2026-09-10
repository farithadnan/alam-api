export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface HttpOpts {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/** GET with hard timeout + exponential backoff retries — shared by every adapter. */
async function httpGet(url: string, opts: HttpOpts): Promise<Response> {
  const { timeoutMs = 15_000, retries = 3, headers } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { accept: headers?.accept ?? "application/json", ...headers },
          signal: ac.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(400 * 2 ** attempt);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

export async function fetchJson<T>(url: string, opts: HttpOpts = {}): Promise<T> {
  const res = await httpGet(url, opts);
  return (await res.json()) as T;
}

export async function fetchText(url: string, opts: HttpOpts = {}): Promise<string> {
  const res = await httpGet(url, opts);
  return res.text();
}
