import { deltaE2000, labToHex } from "@/lib/measure/color";

/*
 * Dominant colors by k-means in CIE Lab (perceptually uniform, so clusters
 * match what people see). Deterministic: fixed sample stride, k-means++ with
 * a seeded PRNG, fixed iteration count - the same image always gives the
 * same palette.
 */

export type MeasuredColor = {
  hex: string;
  /** Share of the image (0..1). */
  share: number;
  lab: { L: number; a: number; b: number };
};

const K = 6;
const SAMPLE_TARGET = 6000;
const ITERATIONS = 15;
/** Clusters closer than this CIEDE2000 distance are merged. */
const MERGE_DELTA_E = 6;

function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function dominantColors(L: Float32Array, A: Float32Array, B: Float32Array, n: number): MeasuredColor[] {
  const stride = Math.max(1, Math.floor(n / SAMPLE_TARGET));
  const samples: [number, number, number][] = [];
  for (let i = 0; i < n; i += stride) samples.push([L[i], A[i], B[i]]);
  const m = samples.length;
  if (m === 0) return [];

  // Squared Euclidean distance in Lab is CIE76 - fine for clustering.
  const d2 = (p: [number, number, number], c: [number, number, number]) =>
    (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;

  const random = mulberry32(0x5eed);
  const centers: [number, number, number][] = [samples[Math.floor(random() * m)]];
  const nearest = new Float64Array(m).fill(Infinity);
  while (centers.length < Math.min(K, m)) {
    let total = 0;
    const last = centers[centers.length - 1];
    for (let i = 0; i < m; i++) {
      nearest[i] = Math.min(nearest[i], d2(samples[i], last));
      total += nearest[i];
    }
    if (total === 0) break; // all samples identical
    let target = random() * total;
    let pick = m - 1;
    for (let i = 0; i < m; i++) {
      target -= nearest[i];
      if (target <= 0) {
        pick = i;
        break;
      }
    }
    centers.push([...samples[pick]]);
  }

  const assignment = new Uint8Array(m);
  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const sums = centers.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < m; i++) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = d2(samples[i], centers[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      assignment[i] = best;
      const s = sums[best];
      s[0] += samples[i][0];
      s[1] += samples[i][1];
      s[2] += samples[i][2];
      s[3]++;
    }
    centers.forEach((center, c) => {
      const s = sums[c];
      if (s[3]) {
        center[0] = s[0] / s[3];
        center[1] = s[1] / s[3];
        center[2] = s[2] / s[3];
      }
    });
  }

  const counts = new Array(centers.length).fill(0);
  for (let i = 0; i < m; i++) counts[assignment[i]]++;
  let clusters = centers
    .map((center, c) => ({ lab: { L: center[0], a: center[1], b: center[2] }, count: counts[c] }))
    .filter((cluster) => cluster.count > 0)
    .sort((x, y) => y.count - x.count);

  // Merge near-identical clusters into the larger one (weighted mean).
  const merged: typeof clusters = [];
  for (const cluster of clusters) {
    const target = merged.find((existing) => deltaE2000(existing.lab, cluster.lab) < MERGE_DELTA_E);
    if (!target) {
      merged.push({ ...cluster, lab: { ...cluster.lab } });
      continue;
    }
    const total = target.count + cluster.count;
    target.lab = {
      L: (target.lab.L * target.count + cluster.lab.L * cluster.count) / total,
      a: (target.lab.a * target.count + cluster.lab.a * cluster.count) / total,
      b: (target.lab.b * target.count + cluster.lab.b * cluster.count) / total,
    };
    target.count = total;
  }
  clusters = merged.sort((x, y) => y.count - x.count);

  return clusters.map((cluster) => ({
    hex: labToHex(cluster.lab),
    share: round(cluster.count / m, 3),
    lab: { L: round(cluster.lab.L, 1), a: round(cluster.lab.a, 1), b: round(cluster.lab.b, 1) },
  }));
}
