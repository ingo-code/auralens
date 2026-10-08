import { describe, expect, it } from "vitest";
import { getMessages } from "@/lib/i18n";
import { localeFromAcceptLanguage, resolveLocale } from "@/lib/i18n/config";

describe("localeFromAcceptLanguage", () => {
  it.each([
    ["en-US,en;q=0.9,de;q=0.8", "en"],
    ["de-DE,de;q=0.9,en;q=0.8", "de"],
    ["fr-FR,fr;q=0.9,en;q=0.7,de;q=0.8", "de"], // q-weights win over position
    ["fr-FR,es;q=0.5", undefined],
    ["", undefined],
  ])("%s -> %s", (header, expected) => {
    expect(localeFromAcceptLanguage(header)).toBe(expected);
  });
});

describe("resolveLocale", () => {
  it("bevorzugt explizite Wahl vor Cookie vor Browsersprache", () => {
    expect(resolveLocale({ explicit: "en", cookie: "de", acceptLanguage: "de" })).toBe("en");
    expect(resolveLocale({ cookie: "en", acceptLanguage: "de" })).toBe("en");
    expect(resolveLocale({ acceptLanguage: "en-GB" })).toBe("en");
  });

  it("ignoriert unbekannte Werte und fällt auf Deutsch zurück", () => {
    expect(resolveLocale({ explicit: "fr", cookie: "xx", acceptLanguage: "it" })).toBe("de");
    expect(resolveLocale({})).toBe("de");
  });
});

/** Flattens a dictionary into "path -> kind" pairs (functions report their arity). */
function shape(value: unknown, path = ""): Record<string, string> {
  if (typeof value === "function") return { [path]: `fn/${value.length}` };
  if (typeof value === "string") return { [path]: "string" };
  if (Array.isArray(value)) return { [path]: `array/${value.length}` };
  return Object.entries(value as Record<string, unknown>).reduce(
    (acc, [key, child]) => ({ ...acc, ...shape(child, path ? `${path}.${key}` : key) }),
    {}
  );
}

describe("Wörterbücher", () => {
  const de = getMessages("de");
  const en = getMessages("en");

  it("haben auf Deutsch und Englisch exakt dieselben Schlüssel, Arrays und Funktions-Signaturen", () => {
    expect(shape(en)).toEqual(shape(de));
  });

  it("enthalten keine leeren Texte", () => {
    const empty = (dict: unknown) =>
      Object.entries(shape(dict)).filter(([path, kind]) => {
        if (kind !== "string") return false;
        const text = path.split(".").reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], dict);
        return (text as string).trim() === "";
      });
    expect(empty(de)).toEqual([]);
    expect(empty(en)).toEqual([]);
  });

  it("sind wirklich übersetzt (Stichproben)", () => {
    expect(en.home.analyzing).not.toBe(de.home.analyzing);
    expect(en.labels.categories.travel).toBe("Travel");
    expect(en.errors.seriesTooFew(2)).toBe("A series analysis needs at least 2 images.");
  });
});
