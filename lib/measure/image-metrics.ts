import {
  chroma,
  labToCctDuv,
  SRGB_TO_LINEAR,
  xyzToLab,
  linearRgbToXyz,
  type Lab,
} from "@/lib/measure/color";
import { dominantColors, type MeasuredColor } from "@/lib/measure/palette";

/*
 * Pixel measurements of one image. Every value is computed from the decoded
 * sRGB pixels with a fixed, documented method - nothing is estimated by AI.
 * Input: interleaved 8-bit RGB (3 channels) at a fixed working size (see
 * MEASURE_LONG_EDGE), so sharpness and noise are comparable across images.
 */

export const MEASUREMENT_VERSION = 1;
/** Working size: long edge in pixels. Sharpness/noise refer to this scale. */
export const MEASURE_LONG_EDGE = 1024;

export type ImageMeasurements = {
  version: typeof MEASUREMENT_VERSION;
  /** Working size the values refer to. */
  width: number;
  height: number;
  exposure: {
    /** Log-average scene luminance relative to 18 % grey, in stops (EV). 0 = average key. */
    keyEv: number;
    /** Mean linear luminance Y (0..1). */
    meanLuminance: number;
    /** L* percentiles (0..100). */
    lightness: { p2: number; p50: number; p98: number };
  };
  /** Share of pixels (0..1) that are clipped. */
  clipping: { highlights: number; shadows: number };
  contrast: {
    /** Standard deviation of L* (RMS contrast). */
    rms: number;
    /** L* range between the 2nd and 98th percentile. */
    range: number;
  };
  color: {
    meanLab: Lab;
    /** Mean CIE chroma C*ab of the mid-tones. */
    meanChroma: number;
    /** Hasler & Süsstrunk (2003) colorfulness M. */
    colorfulness: number;
  };
  whiteBalance: {
    /** a*, b* of the most neutral mid-tones; (0, 0) = perfectly neutral greys. */
    neutral: { a: number; b: number };
    /** CCT of the neutral greys' chromaticity. 6504 K = neutral for sRGB (D65). */
    kelvin: number;
    /** Distance from the Planckian locus: > 0 green, < 0 magenta. D65 itself is +0.0032. */
    duv: number;
    /** Share of pixels used as neutral reference. */
    sampleShare: number;
  };
  sharpness: {
    /**
     * Variance of the Laplacian (on 0..255 luminance) in the sharpest 10 %
     * of tiles, minus the noise contribution. Below ~60 the image is soft
     * even where it is in focus.
     */
    focus: number;
    /** Same measure over the whole frame (lower with intentional bokeh). */
    global: number;
  };
  noise: {
    /** Noise standard deviation in 0..255 luminance units (Immerkær 1996) in the flattest tiles. */
    sigma: number;
  };
  palette: MeasuredColor[];
};

const TILE_GRID = 8;

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

/** Percentiles from a histogram over L* in 0.1 steps. */
function percentileFromHistogram(histogram: Uint32Array, total: number, p: number): number {
  const target = total * p;
  let sum = 0;
  for (let i = 0; i < histogram.length; i++) {
    sum += histogram[i];
    if (sum >= target) return i / 10;
  }
  return 100;
}

export function measurePixels(rgb: Uint8Array | Uint8ClampedArray, width: number, height: number): ImageMeasurements {
  const n = width * height;
  if (n === 0 || rgb.length < n * 3) throw new Error("measurePixels: leere oder zu kurze Pixeldaten");

  const L = new Float32Array(n);
  const A = new Float32Array(n);
  const B = new Float32Array(n);
  const luma = new Float32Array(n); // gamma-encoded luminance, 0..255 (Rec. 601 weights)
  const histogram = new Uint32Array(1001);

  let logSum = 0;
  let ySum = 0;
  let highlights = 0;
  let shadows = 0;
  let lSum = 0;
  let lSqSum = 0;
  let aSum = 0;
  let bSum = 0;
  let midCount = 0;
  let midChromaSum = 0;
  // Hasler-Süsstrunk opponent channels
  let rgSum = 0;
  let rgSq = 0;
  let ybSum = 0;
  let ybSq = 0;

  for (let i = 0, p = 0; i < n; i++, p += 3) {
    const r8 = rgb[p];
    const g8 = rgb[p + 1];
    const b8 = rgb[p + 2];
    const [x, y, z] = linearRgbToXyz(SRGB_TO_LINEAR[r8], SRGB_TO_LINEAR[g8], SRGB_TO_LINEAR[b8]);
    const lab = xyzToLab(x, y, z);
    L[i] = lab.L;
    A[i] = lab.a;
    B[i] = lab.b;
    luma[i] = 0.299 * r8 + 0.587 * g8 + 0.114 * b8;

    logSum += Math.log(1e-4 + y);
    ySum += y;
    const max = Math.max(r8, g8, b8);
    if (max >= 254) highlights++;
    if (max <= 2) shadows++;

    histogram[Math.min(1000, Math.max(0, Math.round(lab.L * 10)))]++;
    lSum += lab.L;
    lSqSum += lab.L * lab.L;
    aSum += lab.a;
    bSum += lab.b;
    if (lab.L >= 10 && lab.L <= 95) {
      midCount++;
      midChromaSum += chroma(lab.a, lab.b);
    }

    const rg = r8 - g8;
    const yb = 0.5 * (r8 + g8) - b8;
    rgSum += rg;
    rgSq += rg * rg;
    ybSum += yb;
    ybSq += yb * yb;
  }

  const meanL = lSum / n;
  const p2 = percentileFromHistogram(histogram, n, 0.02);
  const p50 = percentileFromHistogram(histogram, n, 0.5);
  const p98 = percentileFromHistogram(histogram, n, 0.98);

  const rgMean = rgSum / n;
  const ybMean = ybSum / n;
  const rgStd = Math.sqrt(Math.max(0, rgSq / n - rgMean * rgMean));
  const ybStd = Math.sqrt(Math.max(0, ybSq / n - ybMean * ybMean));
  const colorfulness = Math.hypot(rgStd, ybStd) + 0.3 * Math.hypot(rgMean, ybMean);

  const whiteBalance = measureNeutral(rgb, L, A, B, n);
  const { focus, global, sigma } = measureDetail(luma, width, height);

  return {
    version: MEASUREMENT_VERSION,
    width,
    height,
    exposure: {
      keyEv: round(Math.log2(Math.exp(logSum / n) / 0.18), 2),
      meanLuminance: round(ySum / n, 4),
      lightness: { p2: round(p2, 1), p50: round(p50, 1), p98: round(p98, 1) },
    },
    clipping: { highlights: round(highlights / n, 4), shadows: round(shadows / n, 4) },
    contrast: {
      rms: round(Math.sqrt(Math.max(0, lSqSum / n - meanL * meanL)), 2),
      range: round(p98 - p2, 1),
    },
    color: {
      meanLab: { L: round(meanL, 2), a: round(aSum / n, 2), b: round(bSum / n, 2) },
      meanChroma: round(midCount ? midChromaSum / midCount : 0, 2),
      colorfulness: round(colorfulness, 2),
    },
    whiteBalance,
    sharpness: { focus: round(focus, 1), global: round(global, 1) },
    noise: { sigma: round(sigma, 2) },
    palette: dominantColors(L, A, B, n),
  };
}

/**
 * White balance from the most neutral mid-tones: pixels with L* 25-92 and
 * no clipped channel, of which the 10 % with the lowest chroma are taken as
 * "should be grey". Their mean a*, b* is the color cast; their chromaticity
 * gives CCT and Duv. Falls back to all mid-tones (grey world) when too few
 * candidates exist. Limitation: scenes without any neutral surface bias it
 * towards the least saturated object color.
 */
function measureNeutral(
  rgb: Uint8Array | Uint8ClampedArray,
  L: Float32Array,
  A: Float32Array,
  B: Float32Array,
  n: number
): ImageMeasurements["whiteBalance"] {
  const candidates: number[] = [];
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    if (L[i] < 25 || L[i] > 92) continue;
    if (Math.max(rgb[p], rgb[p + 1], rgb[p + 2]) >= 250) continue;
    candidates.push(i);
  }
  let selected = candidates;
  if (candidates.length >= 200) {
    // Bucket by chroma (0.1 steps up to 150) to find the 10 % threshold in O(n).
    const buckets = new Uint32Array(1501);
    for (const i of candidates) buckets[Math.min(1500, Math.round(chroma(A[i], B[i]) * 10))]++;
    const target = Math.max(100, Math.round(candidates.length * 0.1));
    let threshold = 0;
    for (let sum = 0; threshold < buckets.length; threshold++) {
      sum += buckets[threshold];
      if (sum >= target) break;
    }
    selected = candidates.filter((i) => Math.round(chroma(A[i], B[i]) * 10) <= threshold);
  }
  const pool = selected.length ? selected : Array.from({ length: n }, (_, i) => i);
  let l = 0;
  let a = 0;
  let b = 0;
  for (const i of pool) {
    l += L[i];
    a += A[i];
    b += B[i];
  }
  const neutral: Lab = { L: l / pool.length, a: a / pool.length, b: b / pool.length };
  const { kelvin, duv } = labToCctDuv(neutral);
  return {
    neutral: { a: round(neutral.a, 2), b: round(neutral.b, 2) },
    kelvin: Math.round(kelvin),
    duv: round(duv, 4),
    sampleShare: round(pool.length / n, 4),
  };
}

/**
 * Sharpness and noise on the luminance plane, per tile of an 8x8 grid:
 * - Laplacian variance ([0 1 0; 1 -4 1; 0 1 0]) - classic focus measure.
 * - Immerkær's noise operator ([1 -2 1; -2 4 -2; 1 -2 1]) suppresses image
 *   structure; sigma = sqrt(pi/2) / 6 * mean |response|, taken in the 25 %
 *   flattest tiles (lowest Laplacian variance) where texture can't leak in.
 * The noise contribution to the Laplacian variance (20 * sigma^2 for white
 * noise, the kernel's squared sum) is subtracted from the focus value.
 */
function measureDetail(luma: Float32Array, width: number, height: number) {
  const tiles = TILE_GRID * TILE_GRID;
  const lapSum = new Float64Array(tiles);
  const lapSq = new Float64Array(tiles);
  const noiseAbs = new Float64Array(tiles);
  const count = new Uint32Array(tiles);
  let gSum = 0;
  let gSq = 0;
  let gCount = 0;

  for (let y = 1; y < height - 1; y++) {
    const ty = Math.min(TILE_GRID - 1, Math.floor((y * TILE_GRID) / height));
    const row = y * width;
    for (let x = 1; x < width - 1; x++) {
      const tx = Math.min(TILE_GRID - 1, Math.floor((x * TILE_GRID) / width));
      const t = ty * TILE_GRID + tx;
      const i = row + x;
      const c = luma[i];
      const up = luma[i - width];
      const down = luma[i + width];
      const left = luma[i - 1];
      const right = luma[i + 1];
      const lap = up + down + left + right - 4 * c;
      const diag = luma[i - width - 1] + luma[i - width + 1] + luma[i + width - 1] + luma[i + width + 1];
      const immerkaer = diag - 2 * (up + down + left + right) + 4 * c;

      lapSum[t] += lap;
      lapSq[t] += lap * lap;
      noiseAbs[t] += Math.abs(immerkaer);
      count[t]++;
      gSum += lap;
      gSq += lap * lap;
      gCount++;
    }
  }

  const stats = Array.from({ length: tiles }, (_, t) => {
    const c = count[t] || 1;
    const mean = lapSum[t] / c;
    return { variance: Math.max(0, lapSq[t] / c - mean * mean), noise: (Math.sqrt(Math.PI / 2) / 6) * (noiseAbs[t] / c) };
  }).filter((_, t) => count[t] > 0);

  const byVariance = [...stats].sort((a, b) => a.variance - b.variance);
  const flat = byVariance.slice(0, Math.max(1, Math.round(byVariance.length * 0.25)));
  const sigma = flat.reduce((sum, s) => sum + s.noise, 0) / flat.length;
  const noiseVariance = 20 * sigma * sigma;

  const sharpest = byVariance.slice(-Math.max(1, Math.round(byVariance.length * 0.1)));
  const focusRaw = sharpest.reduce((sum, s) => sum + s.variance, 0) / sharpest.length;
  const gMean = gCount ? gSum / gCount : 0;
  const globalRaw = gCount ? gSq / gCount - gMean * gMean : 0;

  return {
    focus: Math.max(0, focusRaw - noiseVariance),
    global: Math.max(0, globalRaw - noiseVariance),
    sigma,
  };
}
