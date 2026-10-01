import { beforeEach, describe, expect, it } from "vitest";
import { _resetRateLimitStore, checkRateLimit, getClientIdentifier } from "@/lib/rate-limit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    _resetRateLimitStore();
  });

  it("erlaubt Requests bis zum Limit", () => {
    const options = { limit: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) {
      const result = checkRateLimit("key-a", options);
      expect(result.success).toBe(true);
    }
  });

  it("blockt sobald das Limit erreicht ist", () => {
    const options = { limit: 2, windowMs: 60_000 };
    checkRateLimit("key-b", options);
    checkRateLimit("key-b", options);
    const result = checkRateLimit("key-b", options);
    expect(result.success).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("behandelt verschiedene Keys unabhängig voneinander", () => {
    const options = { limit: 1, windowMs: 60_000 };
    expect(checkRateLimit("key-c", options).success).toBe(true);
    expect(checkRateLimit("key-d", options).success).toBe(true);
    expect(checkRateLimit("key-c", options).success).toBe(false);
  });

  it("setzt das Limit nach Ablauf des Zeitfensters zurück", () => {
    const options = { limit: 1, windowMs: 10 };
    expect(checkRateLimit("key-e", options).success).toBe(true);
    expect(checkRateLimit("key-e", options).success).toBe(false);

    const resetAt = checkRateLimit("key-e", options).resetAt;
    expect(resetAt).toBeGreaterThan(Date.now() - 1);
  });
});

describe("getClientIdentifier", () => {
  it("nutzt x-forwarded-for, erste Adresse bei mehreren", () => {
    const headers = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(getClientIdentifier(headers)).toBe("1.2.3.4");
  });

  it("fällt auf x-real-ip zurück, wenn x-forwarded-for fehlt", () => {
    const headers = new Headers({ "x-real-ip": "9.9.9.9" });
    expect(getClientIdentifier(headers)).toBe("9.9.9.9");
  });

  it("gibt 'unknown' zurück, wenn keine IP-Header vorhanden sind", () => {
    const headers = new Headers();
    expect(getClientIdentifier(headers)).toBe("unknown");
  });
});
