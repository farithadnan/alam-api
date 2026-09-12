/**
 * Thin Telegram Bot API client: long-poll getUpdates + sendMessage.
 *
 * Kept deliberately small and separate from the alert engine. The pump holds one
 * long-poll request open at a time; Telegram itself owns the offset, so a restart
 * simply resumes where the last confirmed update left off with no missed or
 * duplicated commands.
 */

const API = "https://api.telegram.org/bot";

/** Telegram error codes we handle explicitly rather than as generic failures. */
const FLOOD_409 = 409; // conflict: another getUpdates consumer owns this bot
const AUTH_401 = 401;

type Log = (msg: string) => void;

export class TelegramClient {
  private readonly base: string;
  private readonly timeoutMs: number;

  constructor(token: string, private readonly log: Log, timeoutMs = 45_000) {
    if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required to start the notifier");
    this.base = `${API}${token}`;
    this.timeoutMs = timeoutMs;
  }

  private async api(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw Object.assign(new Error(`Telegram ${method} HTTP ${res.status}: ${body.slice(0, 300)}`), { status: res.status });
    }
    const data = (await res.json()) as { ok: boolean; result?: unknown; description?: string; error_code?: number };
    if (!data.ok) {
      throw Object.assign(new Error(`Telegram ${method} failed: ${data.description ?? "unknown error"}`), {
        status: data.error_code,
      });
    }
    return (data.result as Record<string, unknown>) ?? {};
  }

  /** Ping the API to fail fast when the token is wrong before any polling starts. */
  async getMe(): Promise<string> {
    const me = await this.api("getMe");
    return String(me.username ?? "bot");
  }

  /**
   * One long-poll pass. `offset` = the id after the last handled update, so the
   * next call only returns newer messages and Telegram drops the acknowledged ones.
   */
  async getUpdates(offset: number, limit = 50): Promise<TelegramUpdate[]> {
    const res = await this.api("getUpdates", { offset, limit, timeout: 25, allowed_updates: ["message"] });
    const updates = (Array.isArray(res) ? res : []) as Record<string, unknown>[];
    return (updates as unknown[] as TelegramUpdate[]);
  }

  async sendMessage(chatId: number, text: string): Promise<boolean> {
    if (!text) return false;
    await this.api("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
    this.log(`[telegram] sent to ${chatId}`);
    return true;
  }
}

/**
 * The standard getUpdates payload we actually read. The API returns many more
 * optional fields than this; the pump destructures only what the handlers need.
 */
export interface TelegramUpdate {
  update_id: number;
  message?: {
    chat?: { id?: number };
    text?: string;
  };
}

/** Drain and handle updates until the loop is told to stop. */
export async function runPump(client: TelegramClient, handle: (u: TelegramUpdate) => Promise<void>, log: Log): Promise<void> {
  let offset = 0;
  while (true) {
    try {
      const updates = await client.getUpdates(offset);
      for (const u of updates) {
        if (u.update_id >= offset) offset = u.update_id + 1;
        await handle(u);
      }
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === AUTH_401) {
        log("[telegram] 401 — invalid TELEGRAM_BOT_TOKEN, stopping pump");
        return;
      }
      if (status === FLOOD_409) {
        log("[telegram] 409 — another consumer owns this bot; stopping pump");
        return;
      }
      // Transient network/API error: back off briefly, then keep polling.
      log(`[telegram] getUpdates error: ${err instanceof Error ? err.message : String(err)}`);
      await sleep(3_000);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
