import type { ImageMeasurements } from "@/lib/measure/image-metrics";
import { compareSeries, type MeasuredCorrection } from "@/lib/measure/series-comparison";

/*
 * Turns the pixel measurements into a fact block for the Claude prompt, so
 * the model explains and prioritizes - but takes every number (Kelvin, EV,
 * tint, percentages) from the measurement instead of estimating it.
 */

const de = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");
const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${de(Math.abs(value), digits)}`;
const percent = (share: number) => `${de(share * 100)} %`;

export function describeCorrection(c: MeasuredCorrection): string {
  const parts: string[] = [];
  if (c.exposureEv !== undefined) parts.push(`Belichtung ${signed(c.exposureEv, 2)} EV`);
  if (c.temperatureK !== undefined) parts.push(`Temperatur ${signed(c.temperatureK, 0)} K (${signed(c.temperatureMired ?? 0, 0)} Mired)`);
  if (c.tint) parts.push(`Tint Richtung ${c.tint.direction === "magenta" ? "Magenta" : "Grün"} (ΔDuv ${de(c.tint.duv, 4)})`);
  if (c.contrastPercent !== undefined) parts.push(`Kontrast ${signed(c.contrastPercent, 0)} %`);
  if (c.saturation !== undefined) parts.push(`Sättigung ${signed(c.saturation, 0)}`);
  return parts.join(", ");
}

function describeImage(m: ImageMeasurements): string {
  return [
    `Key ${de(m.exposure.keyEv, 2)} EV`,
    `Neutraltöne ${m.whiteBalance.kelvin} K (a* ${de(m.whiteBalance.neutral.a)}, b* ${de(m.whiteBalance.neutral.b)}), Duv ${de(m.whiteBalance.duv, 4)}`,
    `Kontrast (RMS L*) ${de(m.contrast.rms)}`,
    `Chroma ${de(m.color.meanChroma)}`,
    `Clipping Lichter ${percent(m.clipping.highlights)}, Schatten ${percent(m.clipping.shadows)}`,
    `Schärfe Fokusbereich ${Math.round(m.sharpness.focus)}`,
    `Rauschen σ ${de(m.noise.sigma, 2)}`,
  ].join("; ");
}

/** Null when any image lacks measurements - the prompt then stays as before. */
export function measuredFactsPrompt(measurements: (ImageMeasurements | undefined)[]): string | null {
  if (measurements.length < 2 || measurements.some((m) => !m)) return null;
  const series = compareSeries(measurements.map((m, i) => ({ index: i + 1, measurements: m! })));
  if (!series) return null;
  const ref = series.reference;

  const lines = [
    "GEMESSENE PIXELWERTE (exakt aus den Bilddaten berechnet, verbindlich):",
    `Serien-Referenz (Median): Key ${de(ref.keyEv, 2)} EV, Neutraltöne ${ref.kelvin} K, Duv ${de(ref.duv, 4)}, ` +
      `Kontrast ${de(ref.contrastRms)}, Chroma ${de(ref.meanChroma)}.`,
  ];
  series.images.forEach((image, i) => {
    const correction = describeCorrection(image.correction);
    lines.push(
      `Bild ${image.index}: ${describeImage(measurements[i]!)}. ` +
        (correction ? `Gemessene Korrektur zur Serie: ${correction}.` : "Keine messbare Farb-/Belichtungsabweichung zur Serie.")
    );
  });
  lines.push(
    "Regeln: Übernimm in jedem `fix` genau diese gemessenen Korrekturwerte (EV, Kelvin, Tint-Richtung, Prozent) " +
      "und erfinde keine eigenen Zahlen. Ohne gemessene Abweichung keine Zahlen für Farbe oder Belichtung nennen. " +
      "Kontrast und Chroma hängen auch vom Motiv ab: Beurteile selbst, ob eine Abweichung am Look oder am Motiv liegt, " +
      "und sag das. Ausgefressene Lichter lassen sich nicht vollständig zurückholen - weise darauf hin."
  );
  return lines.join("\n");
}
