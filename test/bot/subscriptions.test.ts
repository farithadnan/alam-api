import { describe, expect, it } from "vitest";
import { Store, DEFAULT_ALERT_TYPES } from "../../src/store/db.js";

const store = () => new Store(":memory:");

describe("chat subscription storage", () => {
  it("round-trips a subscription and lists enabled chats", () => {
    const s = store();
    try {
      s.upsertSubscription({
        chatId: 7,
        townSlug: "arau",
        state: "Perlis",
        place: "Arau, Perlis",
        alertTypes: ["aqi"],
        enabled: true,
      });
      const sub = s.getSubscription(7);
      expect(sub?.place).toBe("Arau, Perlis");
      expect(sub?.alertTypes).toEqual(["aqi"]);
      expect(s.getSubscriptions(true).map((r) => r.chatId)).toEqual([7]);
      s.setChatEnabled(7, false);
      expect(s.getSubscriptions(true)).toHaveLength(0); // disabled chat no longer polled
    } finally {
      s.close();
    }
  });

  it("/start-style upsert refreshes alert types and re-enables", () => {
    const s = store();
    try {
      s.upsertSubscription({ chatId: 8, townSlug: "arau", state: "Perlis", place: "Arau, Perlis", alertTypes: ["aqi"], enabled: true });
      s.setChatEnabled(8, false);
      s.upsertSubscription({ chatId: 8, townSlug: "arau", state: "Perlis", place: "Arau, Perlis", alertTypes: DEFAULT_ALERT_TYPES, enabled: true });
      expect(s.getSubscription(8)?.alertTypes).toEqual(DEFAULT_ALERT_TYPES);
      expect(s.getSubscription(8)?.enabled).toBe(true);
    } finally {
      s.close();
    }
  });
});

describe("alert state storage", () => {
  it("persists and updates an edge row, keeping unrelated rows intact", () => {
    const s = store();
    try {
      s.setAlertState({ chatId: 1, kind: "aqi", key: "PERL-ARA", lastBand: "Unhealthy", lastValue: 162, lastAlertAt: "t", lastRecoveryAt: null });
      s.setAlertState({ chatId: 1, kind: "warning", key: "thunder", lastBand: null, lastValue: 2, lastAlertAt: "t", lastRecoveryAt: null });
      s.setAlertState({ chatId: 1, kind: "aqi", key: "PERL-ARA", lastBand: "Moderate", lastValue: 80, lastAlertAt: null, lastRecoveryAt: "r" });
      const rows = s.alertStateForChat(1);
      expect(rows).toHaveLength(2);
      const aqi = rows.find((r) => r.kind === "aqi")!;
      expect(aqi.lastBand).toBe("Moderate");
      expect(aqi.lastRecoveryAt).toBe("r");
      expect(rows.find((r) => r.kind === "warning")?.lastAlertAt).toBe("t");
    } finally {
      s.close();
    }
  });
});
