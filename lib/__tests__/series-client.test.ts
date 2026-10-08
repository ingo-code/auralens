import { describe, expect, it } from "vitest";
import { getMessages } from "@/lib/i18n";
import { validateSeriesSelection } from "@/lib/series-client";

const t = getMessages("de");

const jpeg = (name: string, size = 1000) =>
  new File([new Uint8Array(size)], name, { type: "image/jpeg" });

describe("validateSeriesSelection", () => {
  it("akzeptiert 2-10 gültige Bilder", () => {
    expect(validateSeriesSelection([jpeg("a.jpg"), jpeg("b.jpg")], t)).toBeNull();
  });

  it("verlangt mindestens 2 und höchstens 10 Bilder", () => {
    expect(validateSeriesSelection([jpeg("a.jpg")], t)).toMatch(/mindestens 2/);
    expect(validateSeriesSelection(Array.from({ length: 11 }, (_, i) => jpeg(`${i}.jpg`)), t)).toMatch(/Maximal 10/);
  });

  it("nennt Nummer und Name eines ungültigen Bildes", () => {
    const text = new File(["x"], "notiz.txt", { type: "text/plain" });
    expect(validateSeriesSelection([jpeg("a.jpg"), text], t)).toMatch(/^Bild 2 \(notiz\.txt\)/);
  });

  it("meldet Fehler auf Englisch, wenn die Oberfläche englisch ist", () => {
    const text = new File(["x"], "note.txt", { type: "text/plain" });
    expect(validateSeriesSelection([jpeg("a.jpg"), text], getMessages("en"))).toMatch(
      /^Image 2 \(note\.txt\): Unsupported file type/
    );
  });
});
