// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  buildIptcRecord,
  buildXmpSidecar,
  embedMetadataInJpeg,
  NotAJpegError,
  type EmbeddableMetadata,
} from "@/lib/embedded-metadata";

const META: EmbeddableMetadata = {
  title: 'Sunset at the "golden" beach & dunes',
  description: "Warm evening light over sand dunes, Portugal.",
  keywords: ["beach", "sunset", "dunes", "Beach", "  ", "golden hour"],
};

async function jpeg(withExif = false): Promise<Uint8Array> {
  let image = sharp({ create: { width: 32, height: 16, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg();
  if (withExif) image = image.withExif({ IFD0: { Copyright: "Test Copyright" } });
  return new Uint8Array(await image.toBuffer());
}

/** APPn segments before the scan, as [marker, payload-prefix]. */
function appSegments(bytes: Uint8Array): { marker: number; text: string }[] {
  const out: { marker: number; text: string }[] = [];
  let p = 2;
  while (p < bytes.length && bytes[p + 1] !== 0xda) {
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    if (bytes[p + 1] >= 0xe0 && bytes[p + 1] <= 0xef) {
      out.push({ marker: bytes[p + 1], text: Buffer.from(bytes.subarray(p + 4, p + 2 + length)).toString("latin1") });
    }
    p += 2 + length;
  }
  return out;
}

describe("embedMetadataInJpeg", () => {
  it("schreibt XMP und IPTC, das Bild bleibt dekodierbar", async () => {
    const out = embedMetadataInJpeg(await jpeg(), META);
    const info = await sharp(Buffer.from(out)).metadata();

    expect(info.width).toBe(32);
    const xmp = info.xmp!.toString("utf8");
    expect(xmp).toContain("Sunset at the &quot;golden&quot; beach &amp; dunes");
    expect(xmp).toContain("<rdf:li>golden hour</rdf:li>");
    // Duplicates (case-insensitive) and blank keywords are dropped.
    expect(xmp.match(/<rdf:li>beach<\/rdf:li>/gi)).toHaveLength(1);
    expect(info.iptc!.toString("utf8")).toContain("Warm evening light");
  });

  it("ersetzt vorhandene Metadaten statt sie zu verdoppeln und behält EXIF", async () => {
    const once = embedMetadataInJpeg(await jpeg(true), META);
    const twice = embedMetadataInJpeg(once, { ...META, title: "New title" });

    const segments = appSegments(twice);
    expect(segments.filter((s) => s.text.startsWith("http://ns.adobe.com/xap/1.0/"))).toHaveLength(1);
    expect(segments.filter((s) => s.text.startsWith("Photoshop 3.0"))).toHaveLength(1);
    expect(segments.some((s) => s.text.startsWith("Exif"))).toBe(true);

    const info = await sharp(Buffer.from(twice)).metadata();
    expect(info.xmp!.toString("utf8")).toContain("New title");
    expect(info.xmp!.toString("utf8")).not.toContain("&quot;golden&quot; beach");
  });

  it("lässt die Bilddaten byteweise unverändert", async () => {
    const original = await jpeg();
    const out = embedMetadataInJpeg(original, META);
    const scan = (b: Uint8Array) => {
      for (let i = 2; i < b.length - 1; i++) if (b[i] === 0xff && b[i + 1] === 0xda) return Buffer.from(b.subarray(i));
      throw new Error("no scan");
    };
    expect(scan(out).equals(scan(original))).toBe(true);
  });

  it("lehnt Nicht-JPEGs ab", async () => {
    const png = new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer());
    expect(() => embedMetadataInJpeg(png, META)).toThrow(NotAJpegError);
  });
});

describe("buildIptcRecord", () => {
  it("kürzt Keywords auf die IIM-Grenze von 64 Bytes, ohne UTF-8-Zeichen zu zerschneiden", () => {
    const record = buildIptcRecord({ title: "t", description: "d", keywords: ["ä".repeat(40)] });
    const text = Buffer.from(record).toString("utf8");
    expect(text).toContain("ä".repeat(32));
    expect(text).not.toContain("ä".repeat(33));
    expect(text).not.toContain("�");
  });
});

describe("buildXmpSidecar", () => {
  it("erzeugt ein eigenständiges XMP-Dokument für RAW-Dateien", () => {
    const sidecar = buildXmpSidecar(META);
    expect(sidecar.startsWith('<x:xmpmeta xmlns:x="adobe:ns:meta/"')).toBe(true);
    expect(sidecar).toContain("<dc:subject>");
    expect(sidecar).not.toContain("xpacket");
  });
});
