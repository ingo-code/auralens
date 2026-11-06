import type { Messages } from "@/lib/i18n";
import { INTL_LOCALES, type Locale } from "@/lib/i18n/config";
import type { MeasuredCorrection } from "@/lib/measure/series-comparison";

/** Locale-aware number formatting for measured values. */
export function measurementFormat(locale: Locale) {
  const intl = INTL_LOCALES[locale];
  const num = (value: number, digits = 1) =>
    value.toLocaleString(intl, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const signed = (value: number, digits = 1) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${num(Math.abs(value), digits)}`;
  const pct = (share: number) => `${num(share * 100, 1)} %`;
  return { num, signed, pct };
}

export function formatCorrection(c: MeasuredCorrection, t: Messages, locale: Locale): string[] {
  const { num, signed } = measurementFormat(locale);
  const m = t.measurement.correction;
  const parts: string[] = [];
  if (c.exposureEv !== undefined) parts.push(m.exposure(signed(c.exposureEv, 2)));
  if (c.temperatureK !== undefined) parts.push(m.temperature(signed(c.temperatureK, 0), signed(c.temperatureMired ?? 0, 0)));
  if (c.tint) parts.push((c.tint.direction === "magenta" ? m.tintMagenta : m.tintGreen)(num(c.tint.duv, 4)));
  if (c.contrastPercent !== undefined) parts.push(m.contrast(signed(c.contrastPercent, 0)));
  if (c.saturation !== undefined) parts.push(m.saturation(signed(c.saturation, 0)));
  return parts;
}
