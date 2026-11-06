/*
 * Colorimetry used by the image measurements. All formulas are the standard
 * definitions (IEC 61966-2-1 sRGB, CIE 1976 L*a*b*, CIEDE2000, CIE 1960 UCS)
 * so results are reproducible and comparable with other tools.
 *
 * Reference white is D65, the white point of sRGB: a pixel with R = G = B is
 * neutral (a* = b* = 0) by definition.
 */

export type Lab = { L: number; a: number; b: number };

/** sRGB 8-bit code value -> linear light (0..1), as a lookup table. */
export const SRGB_TO_LINEAR: Float64Array = (() => {
  const table = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    table[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }
  return table;
})();

export function linearToSrgb(value: number): number {
  const c = Math.min(1, Math.max(0, value));
  const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(encoded * 255);
}

/** D65 white in XYZ (Y = 1). */
const XN = 0.95047;
const YN = 1;
const ZN = 1.08883;
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

/** Linear sRGB -> CIE XYZ (D65), IEC 61966-2-1 matrix. */
export function linearRgbToXyz(r: number, g: number, b: number): [number, number, number] {
  return [
    0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
    0.2126729 * r + 0.7151522 * g + 0.072175 * b,
    0.0193339 * r + 0.119192 * g + 0.9503041 * b,
  ];
}

function labF(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

export function xyzToLab(x: number, y: number, z: number): Lab {
  const fx = labF(x / XN);
  const fy = labF(y / YN);
  const fz = labF(z / ZN);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz({ L, a, b }: Lab): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const inv = (f: number) => (f ** 3 > EPSILON ? f ** 3 : (116 * f - 16) / KAPPA);
  return [XN * inv(fx), YN * (L > KAPPA * EPSILON ? fy ** 3 : L / KAPPA), ZN * inv(fz)];
}

export function srgb8ToLab(r: number, g: number, b: number): Lab {
  const [x, y, z] = linearRgbToXyz(SRGB_TO_LINEAR[r], SRGB_TO_LINEAR[g], SRGB_TO_LINEAR[b]);
  return xyzToLab(x, y, z);
}

export function labToHex(lab: Lab): string {
  const [x, y, z] = labToXyz(lab);
  const r = 3.2404542 * x - 1.5371385 * y - 0.4985314 * z;
  const g = -0.969266 * x + 1.8760108 * y + 0.041556 * z;
  const b = 0.0556434 * x - 0.2040259 * y + 1.0572252 * z;
  return `#${[r, g, b].map((c) => linearToSrgb(c).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

export function chroma(a: number, b: number): number {
  return Math.hypot(a, b);
}

/** CIEDE2000 color difference (Sharma, Wu & Dalal 2005), kL = kC = kH = 1. */
export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;
  const rad = Math.PI / 180;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar7 = ((C1 + C2) / 2) ** 7;
  const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const hue = (b: number, a: number) => {
    if (a === 0 && b === 0) return 0;
    const h = Math.atan2(b, a) / rad;
    return h >= 0 ? h : h + 360;
  };
  const h1p = hue(b1, a1p);
  const h2p = hue(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;
  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) <= 180) hbarp = (h1p + h2p) / 2;
    else hbarp = h1p + h2p < 360 ? (h1p + h2p + 360) / 2 : (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((hbarp - 30) * rad) +
    0.24 * Math.cos(2 * hbarp * rad) +
    0.32 * Math.cos((3 * hbarp + 6) * rad) -
    0.2 * Math.cos((4 * hbarp - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hbarp - 275) / 25) ** 2));
  const Cbarp7 = Cbarp ** 7;
  const Rc = 2 * Math.sqrt(Cbarp7 / (Cbarp7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lbarp - 50) ** 2) / Math.sqrt(20 + (Lbarp - 50) ** 2);
  const Sc = 1 + 0.045 * Cbarp;
  const Sh = 1 + 0.015 * Cbarp * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;

  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

// ---------------------------------------------------------------------------
// Correlated color temperature and Duv
// ---------------------------------------------------------------------------

/** CIE 1960 UCS (u, v) from XYZ. */
export function xyzToUv(x: number, y: number, z: number): [number, number] {
  const d = x + 15 * y + 3 * z;
  return d === 0 ? [0, 0] : [(4 * x) / d, (6 * y) / d];
}

/** Planckian locus in CIE 1960 UCS, Krystek (1985) rational approximation, valid 1000-15000 K. */
export function planckianUv(kelvin: number): [number, number] {
  const T = kelvin;
  const u = (0.860117757 + 1.54118254e-4 * T + 1.28641212e-7 * T * T) / (1 + 8.42420235e-4 * T + 7.08145163e-7 * T * T);
  const v = (0.317398726 + 4.22806245e-5 * T + 4.20481691e-8 * T * T) / (1 - 2.89741816e-5 * T + 1.61456053e-7 * T * T);
  return [u, v];
}

export const CCT_MIN_K = 1667;
export const CCT_MAX_K = 15000;

/**
 * CCT as the closest point on the Planckian locus (searched in mired, where
 * the locus is evenly spaced) and Duv as the signed distance to it:
 * positive = above the locus (green), negative = below (magenta/pink).
 */
export function cctAndDuv(u: number, v: number): { kelvin: number; duv: number } {
  const dist = (mired: number) => {
    const [pu, pv] = planckianUv(1e6 / mired);
    return (u - pu) ** 2 + (v - pv) ** 2;
  };
  const lo = 1e6 / CCT_MAX_K;
  const hi = 1e6 / CCT_MIN_K;
  // Coarse scan (1 mired), then golden-section refinement around the best step.
  let best = lo;
  for (let m = lo; m <= hi; m += 1) if (dist(m) < dist(best)) best = m;
  let a = Math.max(lo, best - 1);
  let b = Math.min(hi, best + 1);
  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const c = b - phi * (b - a);
    const d = a + phi * (b - a);
    if (dist(c) < dist(d)) b = d;
    else a = c;
  }
  const mired = (a + b) / 2;
  const kelvin = 1e6 / mired;
  const [pu, pv] = planckianUv(kelvin);
  // Locus tangent direction (towards higher temperature) for the sign.
  const [tu, tv] = planckianUv(kelvin + 1);
  const cross = (tu - pu) * (v - pv) - (tv - pv) * (u - pu);
  const duv = Math.sign(cross || 1) * Math.sqrt((u - pu) ** 2 + (v - pv) ** 2);
  // The locus runs from red (low K, high u) to blue (high K, low u); moving
  // towards higher K the "above" side (green, larger v) is on the right.
  return { kelvin, duv: -duv };
}

/** CCT/Duv of a color given in CIE Lab (D65 reference). */
export function labToCctDuv(lab: Lab): { kelvin: number; duv: number } {
  const [x, y, z] = labToXyz(lab);
  const [u, v] = xyzToUv(x, y, z);
  return cctAndDuv(u, v);
}
