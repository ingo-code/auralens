// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { compressImageForAnalysis } from "@/lib/image-processing";
import { getLegalConfig, missingLegalFields } from "@/lib/legal";

describe("Bildaufbereitung vor der Übermittlung an Anthropic", () => {
  it("entfernt eingebettete Metadaten wie EXIF/GPS (Zusage in der Datenschutzerklärung)", async () => {
    const withExif = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#336699" } })
      .jpeg()
      .withExif({ IFD0: { Artist: "Max Mustermann", Copyright: "privat" }, IFD3: { GPSLatitudeRef: "N" } })
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();

    const processed = await compressImageForAnalysis(withExif);

    const meta = await sharp(processed.data).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.iptc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(processed.data.includes(Buffer.from("Max Mustermann"))).toBe(false);
  });
});

describe("Pflichtangaben für Impressum und Datenschutz", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("liest die Angaben aus Umgebungsvariablen, Adresse zeilenweise", () => {
    vi.stubEnv("LEGAL_OPERATOR_NAME", "Erika Muster");
    vi.stubEnv("LEGAL_ADDRESS", "Musterweg 1 | 12345 Musterstadt");
    vi.stubEnv("LEGAL_EMAIL", "beta@example.org");

    const config = getLegalConfig();

    expect(config).toMatchObject({
      operatorName: "Erika Muster",
      addressLines: ["Musterweg 1", "12345 Musterstadt"],
      email: "beta@example.org",
      phone: null,
    });
    expect(missingLegalFields(config)).toEqual([]);
  });

  it("meldet fehlende Pflichtangaben, statt Platzhalter stillschweigend zu veröffentlichen", () => {
    vi.stubEnv("LEGAL_OPERATOR_NAME", "  ");
    vi.stubEnv("LEGAL_ADDRESS", "");
    vi.stubEnv("LEGAL_EMAIL", "");

    expect(missingLegalFields(getLegalConfig())).toEqual(["LEGAL_OPERATOR_NAME", "LEGAL_ADDRESS", "LEGAL_EMAIL"]);
  });
});
