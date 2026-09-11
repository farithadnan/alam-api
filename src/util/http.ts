export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface HttpOpts {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

/** Transient failures worth retrying. A 404 will never succeed, so never retry it. */
const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 30_000;
/** Minimum gap between requests to the same host, so adapters cannot burst at it. */
const HOST_GAP_MS = 300;
const USER_AGENT = "alam-api/1.0 (+https://github.com/farithadnan/alam-api)";

/** Exponential backoff with full jitter, so parallel adapters do not stampede. */
function backoffMs(attempt: number): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempt);
  return Math.round(exp * (0.5 + Math.random() * 0.5));
}

/** Honour the server's own Retry-After (seconds or HTTP date) when it sends one. */
function retryAfterMs(res: Response): number | null {
  const header = res.headers?.get?.("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(seconds * 1000, MAX_DELAY_MS));
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, Math.min(at - Date.now(), MAX_DELAY_MS)) : null;
}

/** Per-host queue: serialises calls and enforces a minimum gap between them. */
const hostQueue = new Map<string, Promise<unknown>>();

function throughHostQueue<T>(url: string, fn: () => Promise<T>): Promise<T> {
  let host = url;
  try {
    host = new URL(url).host;
  } catch {
    /* keep the raw string as the key */
  }
  const prev = hostQueue.get(host) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(async () => {
    await sleep(HOST_GAP_MS);
    return fn();
  });
  hostQueue.set(host, run.catch(() => {}));
  return run;
}

function statusOf(err: unknown): number | undefined {
  return (err as { status?: number } | null)?.status;
}

/** GET with timeout, per-host politeness, and retries that respect 429/Retry-After. */
async function httpGet(url: string, opts: HttpOpts): Promise<Response> {
  const { timeoutMs = 15_000, retries = 3, headers } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await throughHostQueue(url, async () => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            headers: { accept: headers?.accept ?? "application/json", "user-agent": USER_AGENT, ...headers },
            signal: ac.signal,
          });
          if (res.ok) return res;
          const err = new Error(`HTTP ${res.status} ${res.statusText} for ${url}`) as Error & {
            status: number;
            retryAfterMs: number | null;
          };
          err.status = res.status;
          err.retryAfterMs = retryAfterMs(res);
          throw err;
        } finally {
          clearTimeout(timer);
        }
      });
    } catch (err) {
      lastErr = err;
      const status = statusOf(err);
      // Network/timeout errors have no status: retry those. Other 4xx: fail fast.
      const retryable = status === undefined || RETRYABLE.has(status);
      if (!retryable || attempt >= retries) break;
      const hinted = (err as { retryAfterMs?: number | null } | null)?.retryAfterMs;
      await sleep(hinted ?? backoffMs(attempt));
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
