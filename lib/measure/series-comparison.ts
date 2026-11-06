import type { ImageMeasurements } from "@/lib/measure/image-metrics";

/*
 * Compares the measured images of a series against the series' typical look
 * (the median of every value, so one outlier can't shift the reference) and
 * derives correction values from the measured differences.
 *
 * Thresholds are based on visibility, not statistics:
 * - Exposure: 1/3 EV is the smallest step photographers notice and correct.
 * - White balance: ~10 mired is a just-noticeable shift for neutral greys.
 * - Tint: Duv 0.003 is about the tolerance of a good light source (ANSI C78.377).
 * - Contrast / saturation: 25 % relative difference. Both also depend on the
 *   motif (calm water vs. a bridge), so they are flagged later and their
 *   corrections are capped at +-50.
 * - Sharpness: sharpest area at less than 60 % of the series' median.
 * - Noise: 1.5x the median and at least 1.5 (0..255 units) at working size.
 */

export type MeasuredAspect =
  | "exposure"
  | "white_balance"
  | "tint"
  | "contrast"
  | "saturation"
  | "sharpness"
  | "noise"
  | "highlights"
  | "shadows";

export type MeasuredSeverity = "low" | "medium" | "high";

export type MeasuredDeviation = {
  aspect: MeasuredAspect;
  severity: MeasuredSeverity;
  /** The image's value and the series reference, in the aspect's unit. */
  value: number;
  reference: number;
  /** Signed difference image - reference (ratio for contrast/saturation/sharpness/noise). */
  delta: number;
};

export type MeasuredCorrection = {
  /** Lightroom/ACR "Exposure" in stops. */
  exposureEv?: number;
  /**
   * White balance shift in Kelvin, at the reference color temperature:
   * negative = cooler. Exact for the neutral greys' appearance; on a RAW
   * file's Temperature slider it is a close starting value, on JPEGs the
   * slider is relative (use the direction and magnitude).
   */
  temperatureK?: number;
  /** Same shift in mired (1e6 / K), the perceptually even unit. */
  temperatureMired?: number;
  tint?: { direction: "green" | "magenta"; duv: number };
  /** Contrast change in percent of the current RMS contrast (capped at +-50). */
  contrastPercent?: number;
  /** Saturation slider (capped at +-50); Lightroom's slider scales chroma roughly linearly. */
  saturation?: number;
};

export type MeasuredImageComparison = {
  index: number;
  /** 0-100, from the weighted measured deviations (100 = matches the series). */
  score: number;
  deviations: MeasuredDeviation[];
  correction: MeasuredCorrection;
};

export type SeriesMeasurementReference = {
  keyEv: number;
  kelvin: number;
  duv: number;
  neutral: { a: number; b: number };
  contrastRms: number;
  meanChroma: number;
  focus: number;
  noiseSigma: number;
};

export type SeriesMeasurement = {
  version: 1;
  reference: SeriesMeasurementReference;
  overallScore: number;
  images: MeasuredImageComparison[];
};

export type MeasuredInput = { index: number; measurements: ImageMeasurements };

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clampSlider(value: number): number {
  const max = THRESHOLDS.maxSliderCorrection;
  return Math.round(Math.max(-max, Math.min(max, value)));
}

/** Severity from how many times the visibility threshold is exceeded (1x low, 2x medium, 3x+ high). */
function severityOf(ratio: number): MeasuredSeverity | null {
  if (ratio < 1) return null;
  if (ratio < 2) return "low";
  if (ratio < 3) return "medium";
  return "high";
}

const THRESHOLDS = {
  exposureEv: 1 / 3,
  mired: 10,
  duv: 0.003,
  relative: 0.25,
  maxSliderCorrection: 50,
  sharpnessRatio: 0.6,
  noiseRatio: 1.5,
  noiseMinSigma: 1.5,
  highlights: 0.01,
  shadows: 0.03,
} as const;

/** Weight of each aspect in the measured score (per threshold multiple, capped at 4). */
const WEIGHTS: Record<MeasuredAspect, number> = {
  exposure: 10,
  white_balance: 10,
  tint: 7,
  contrast: 6,
  saturation: 6,
  sharpness: 5,
  noise: 3,
  highlights: 4,
  shadows: 2,
};

export function referenceOf(inputs: MeasuredInput[]): SeriesMeasurementReference {
  const m = inputs.map((input) => input.measurements);
  return {
    keyEv: median(m.map((x) => x.exposure.keyEv)),
    // Median in mired, the perceptually even scale.
    kelvin: 1e6 / median(m.map((x) => 1e6 / x.whiteBalance.kelvin)),
    duv: median(m.map((x) => x.whiteBalance.duv)),
    neutral: { a: median(m.map((x) => x.whiteBalance.neutral.a)), b: median(m.map((x) => x.whiteBalance.neutral.b)) },
    contrastRms: median(m.map((x) => x.contrast.rms)),
    meanChroma: median(m.map((x) => x.color.meanChroma)),
    focus: median(m.map((x) => x.sharpness.focus)),
    noiseSigma: median(m.map((x) => x.noise.sigma)),
  };
}

export function compareImage(
  index: number,
  m: ImageMeasurements,
  ref: SeriesMeasurementReference
): MeasuredImageComparison {
  const deviations: MeasuredDeviation[] = [];
  const correction: MeasuredCorrection = {};
  let penalty = 0;

  const add = (aspect: MeasuredAspect, ratio: number, value: number, reference: number, delta: number) => {
    const severity = severityOf(ratio);
    if (!severity) return false;
    deviations.push({ aspect, severity, value, reference, delta });
    penalty += WEIGHTS[aspect] * Math.min(ratio, 4);
    return true;
  };

  // Exposure
  const dEv = m.exposure.keyEv - ref.keyEv;
  if (add("exposure", Math.abs(dEv) / THRESHOLDS.exposureEv, m.exposure.keyEv, round(ref.keyEv, 2), round(dEv, 2))) {
    correction.exposureEv = round(roundTo(-dEv, 0.05), 2);
  }

  // White balance: mired shift of the neutral greys (blue-amber axis; green-magenta is tint).
  const miredImage = 1e6 / m.whiteBalance.kelvin;
  const miredRef = 1e6 / ref.kelvin;
  const dMired = miredImage - miredRef;
  if (add("white_balance", Math.abs(dMired) / THRESHOLDS.mired, m.whiteBalance.kelvin, Math.round(ref.kelvin), Math.round(m.whiteBalance.kelvin - ref.kelvin))) {
    // A warmer image (lower K, higher mired) needs a cooler setting: negative value.
    correction.temperatureK = roundTo(m.whiteBalance.kelvin - ref.kelvin, 50);
    correction.temperatureMired = Math.round(miredImage - miredRef);
  }

  // Tint (green-magenta axis)
  const dDuv = m.whiteBalance.duv - ref.duv;
  if (add("tint", Math.abs(dDuv) / THRESHOLDS.duv, m.whiteBalance.duv, round(ref.duv, 4), round(dDuv, 4))) {
    correction.tint = { direction: dDuv > 0 ? "magenta" : "green", duv: round(Math.abs(dDuv), 4) };
  }

  // Contrast and saturation as ratios to the reference
  if (ref.contrastRms > 0) {
    const ratio = m.contrast.rms / ref.contrastRms;
    if (add("contrast", Math.abs(ratio - 1) / THRESHOLDS.relative, m.contrast.rms, round(ref.contrastRms, 2), round(ratio, 2))) {
      correction.contrastPercent = clampSlider((1 / Math.max(ratio, 0.01) - 1) * 100);
    }
  }
  if (ref.meanChroma > 1) {
    const ratio = m.color.meanChroma / ref.meanChroma;
    if (add("saturation", Math.abs(ratio - 1) / THRESHOLDS.relative, m.color.meanChroma, round(ref.meanChroma, 2), round(ratio, 2))) {
      correction.saturation = clampSlider((1 / Math.max(ratio, 0.01) - 1) * 100);
    }
  }

  // Sharpness: only "softer than the series" matters.
  if (ref.focus > 0) {
    const ratio = m.sharpness.focus / ref.focus;
    if (ratio < THRESHOLDS.sharpnessRatio) {
      // Below 60 % low, below 40 % medium, below 25 % high.
      const multiple = ratio < 0.25 ? 3 + (0.25 - ratio) * 4 : ratio < 0.4 ? 2 : 1;
      add("sharpness", multiple, m.sharpness.focus, round(ref.focus, 1), round(ratio, 2));
    }
  }

  // Noise: only "noisier than the series" matters.
  const noiseRatio = ref.noiseSigma > 0 ? m.noise.sigma / ref.noiseSigma : 1;
  if (noiseRatio >= THRESHOLDS.noiseRatio && m.noise.sigma >= THRESHOLDS.noiseMinSigma) {
    add("noise", noiseRatio / THRESHOLDS.noiseRatio, m.noise.sigma, round(ref.noiseSigma, 2), round(noiseRatio, 2));
  }

  // Clipping is judged absolutely - lost detail can't be matched by the others.
  add("highlights", m.clipping.highlights / THRESHOLDS.highlights, m.clipping.highlights, THRESHOLDS.highlights, m.clipping.highlights);
  add("shadows", m.clipping.shadows / THRESHOLDS.shadows, m.clipping.shadows, THRESHOLDS.shadows, m.clipping.shadows);

  return { index, score: Math.max(0, Math.round(100 - penalty)), deviations, correction };
}

export function compareSeries(inputs: MeasuredInput[]): SeriesMeasurement | null {
  if (inputs.length < 2) return null;
  const reference = referenceOf(inputs);
  const images = inputs.map(({ index, measurements }) => compareImage(index, measurements, reference));
  return {
    version: 1,
    reference: {
      ...reference,
      keyEv: round(reference.keyEv, 2),
      kelvin: Math.round(reference.kelvin),
      duv: round(reference.duv, 4),
      neutral: { a: round(reference.neutral.a, 2), b: round(reference.neutral.b, 2) },
      contrastRms: round(reference.contrastRms, 2),
      meanChroma: round(reference.meanChroma, 2),
      focus: round(reference.focus, 1),
      noiseSigma: round(reference.noiseSigma, 2),
    },
    overallScore: Math.round(images.reduce((sum, image) => sum + image.score, 0) / images.length),
    images,
  };
}

/** Comparison from stored file metadata; null unless every image was measured. */
export function seriesMeasurementOf(
  files: { index: number; measurements?: ImageMeasurements }[]
): SeriesMeasurement | null {
  if (files.length < 2 || files.some((file) => !file.measurements)) return null;
  return compareSeries(files.map((file) => ({ index: file.index, measurements: file.measurements! })));
}
