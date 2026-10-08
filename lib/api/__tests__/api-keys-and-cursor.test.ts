// @vitest-environment node
import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey, looksLikeApiKey } from "@/lib/api/api-keys";
import { decodeCursor, encodeCursor } from "@/lib/api/pagination";

describe("API-Keys", () => {
  it("erzeugt zufällige Keys mit lesbarem Präfix und passendem Hash", () => {
    const a = generateApiKey();
    const b = generateApiKey();

    expect(a.key).not.toBe(b.key);
    expect(a.key).toMatch(/^al_live_[A-Za-z0-9_-]{43}$/);
    expect(a.prefix).toBe(a.key.slice(0, "al_live_".length + 4));
    expect(a.hash).toBe(hashApiKey(a.key));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(looksLikeApiKey(a.key)).toBe(true);
  });

  it("erkennt Fremdformate, ohne die Datenbank zu fragen", () => {
    expect(looksLikeApiKey("sk-ant-123")).toBe(false);
    expect(looksLikeApiKey("al_live_kurz")).toBe(false);
  });
});

describe("Cursor", () => {
  const cursor = { createdAt: "2026-10-08T10:00:00.123456+00:00", id: "22222222-2222-4222-8222-222222222222" };

  it("übersteht den Rundweg unverändert", () => {
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("weist alles zurück, was nicht von uns stammt", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(decodeCursor("kein-cursor")).toBeNull();
    expect(decodeCursor(encode({ createdAt: cursor.createdAt, id: cursor.id }))).toBeNull();
    expect(decodeCursor(encode([cursor.createdAt, "1),or(user_id.neq.x"]))).toBeNull();
    expect(decodeCursor(encode(['2026-10-08T10:00:00+00:00",id.gt."0', cursor.id]))).toBeNull();
  });
});
