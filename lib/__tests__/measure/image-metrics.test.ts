// @vitest-environment node
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { linearToSrgb } from "@/lib/measure/color";
import { measurePixels } from "@/lib/measure/image-metrics";
import { measureImageBuffer } from "@/lib/measure/server";
import { compareSeries } from "@/lib/measure/series-comparison";

const W = 256;
const H = 192;

function image(pixel: (x: number, y: number) => [number, number, number], width = W, height = H): Uint8Array {
  const data = new Uint8Array(width * height * 3);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixel(x, y);
      const p = (y * width + x) * 3;
      data[p] = Math.max(0, Math.min(255, Math.round(r)));
      data[p + 1] = Math.max(0, Math.min(255, Math.round(g)));
      data[p + 2] = Math.max(0, Math.min(255, Math.round(b)));
    }
  }
  return data;
}

/** Seeded Gaussian noise (Box-Muller). */
function gaussian(seed: number) {
  let s = seed;
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  return () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
}

/** A scene with greys, colors and texture; `gain` scales linear light, `cast` shifts R/B. */
function scene({ gain = 1, cast = 0, blur = false } = {}): Uint8Array {
  const base = image((x, y) => {
    const checker = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? 0.32 : 0.08;
    const region = x < W / 2 ? [checker, checker, checker] : y < H / 2 ? [0.2, 0.05, 0.03] : [0.03, 0.08, 0.2];
    return region.map((value) => linearToSrgb(value * gain)) as [number, number, number];
  });
  const out = blur ? boxBlur(base, 3) : base;
  if (cast) {
    for (let p = 0; p < out.length; p += 3) {
      out[p] = Math.min(255, out[p] + cast);
      out[p + 2] = Math.max(0, out[p + 2] - cast);
    }
  }
  return out;
}

function boxBlur(src: Uint8Array, radius: number): Uint8Array {
  const out = new Uint8Array(src.length);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;
        let n = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.min(W - 1, Math.max(0, x + dx));
            const yy = Math.min(H - 1, Math.max(0, y + dy));
            sum += src[(yy * W + xx) * 3 + c];
            n++;
          }
        }
        out[(y * W + x) * 3 + c] = Math.round(sum / n);
      }
    }
  }
  return out;
}

describe("measurePixels", () => {
  it("misst ein neutrales Mittelgrau als neutral, ohne Rauschen und Clipping", () => {
    const m = measurePixels(image(() => [119, 119, 119]), W, H);
    expect(Math.abs(m.exposure.keyEv)).toBeLessThan(0.05); // sRGB 119 ≈ 18 % grey
    expect(m.whiteBalance.neutral.a).toBeCloseTo(0, 1);
    expect(m.whiteBalance.neutral.b).toBeCloseTo(0, 1);
    expect(Math.abs(m.whiteBalance.kelvin - 6504)).toBeLessThan(20);
    expect(m.noise.sigma).toBe(0);
    expect(m.clipping).toEqual({ highlights: 0, shadows: 0 });
    expect(m.palette).toHaveLength(1);
  });

  it("misst doppelte Lichtmenge als +1 EV", () => {
    const dark = measurePixels(scene(), W, H);
    const bright = measurePixels(scene({ gain: 2 }), W, H);
    expect(bright.exposure.keyEv - dark.exposure.keyEv).toBeCloseTo(1, 1);
  });

  it("erkennt einen Warmstich als niedrigere Farbtemperatur", () => {
    const neutral = measurePixels(scene(), W, H);
    const warm = measurePixels(scene({ cast: 14 }), W, H);
    expect(warm.whiteBalance.kelvin).toBeLessThan(neutral.whiteBalance.kelvin - 700);
    expect(warm.whiteBalance.neutral.b).toBeGreaterThan(neutral.whiteBalance.neutral.b + 5);
  });

  it("schätzt gaußsches Rauschen auf ±15 % genau", () => {
    const noise = gaussian(42);
    const m = measurePixels(image(() => {
      const v = 128 + 5 * noise();
      return [v, v, v];
    }), W, H);
    expect(m.noise.sigma).toBeGreaterThan(4.25);
    expect(m.noise.sigma).toBeLessThan(5.75);
  });

  it("unterscheidet scharf und unscharf deutlich", () => {
    const sharp = measurePixels(scene(), W, H);
    const soft = measurePixels(scene({ blur: true }), W, H);
    expect(soft.sharpness.focus / sharp.sharpness.focus).toBeLessThan(0.25);
  });

  it("zählt ausgefressene Lichter und abgesoffene Schatten", () => {
    const m = measurePixels(image((x) => (x < W / 4 ? [255, 255, 255] : x < W / 2 ? [0, 0, 0] : [120, 120, 120])), W, H);
    expect(m.clipping.highlights).toBeCloseTo(0.25, 2);
    expect(m.clipping.shadows).toBeCloseTo(0.25, 2);
  });

  it("findet die dominanten Farben mit ihren Anteilen", () => {
    const m = measurePixels(image((x) => (x < W * 0.7 ? [200, 30, 30] : [20, 60, 200])), W, H);
    expect(m.palette.map((c) => c.hex)).toEqual(["#C81E1E", "#143CC8"]);
    expect(m.palette[0].share).toBeCloseTo(0.7, 1);
  });

  it("ist deterministisch", () => {
    const pixels = scene({ cast: 6 });
    expect(measurePixels(pixels, W, H)).toEqual(measurePixels(pixels, W, H));
  });
});

describe("compareSeries", () => {
  const measure = (options: Parameters<typeof scene>[0]) => measurePixels(scene(options), W, H);

  it("markiert nur den Ausreißer und gibt gemessene Korrekturwerte", () => {
    const series = compareSeries([
      { index: 1, measurements: measure({}) },
      { index: 2, measurements: measure({ cast: 14 }) },
      { index: 3, measurements: measure({ gain: 1.05 }) },
      { index: 4, measurements: measure({ gain: 2 }) },
    ])!;

    const [first, warm, similar, bright] = series.images;
    expect(first.deviations).toEqual([]);
    expect(similar.deviations).toEqual([]);
    expect(first.score).toBe(100);

    expect(warm.deviations.map((d) => d.aspect)).toContain("white_balance");
    expect(warm.correction.temperatureK).toBeLessThan(-500); // cooler
    expect(warm.score).toBeLessThan(80);

    expect(bright.deviations.map((d) => d.aspect)).toContain("exposure");
    // Median of 0 / 0 / +0.07 / +1 EV is +0.035 -> about -0.95 EV.
    expect(bright.correction.exposureEv).toBeCloseTo(-0.95, 1);
  });

  it("braucht mindestens zwei Bilder", () => {
    expect(compareSeries([{ index: 1, measurements: measure({}) }])).toBeNull();
  });
});

describe("measureImageBuffer", () => {
  it("dekodiert, rechnet in sRGB um und misst auf der Arbeitsgröße", async () => {
    const jpeg = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 119, g: 119, b: 119 } } })
      .jpeg({ quality: 95 })
      .toBuffer();
    const m = await measureImageBuffer(jpeg);
    expect([m.width, m.height]).toEqual([1024, 683]);
    expect(Math.abs(m.exposure.keyEv)).toBeLessThan(0.05);
  });

  it("wertet transparente Flächen als Weiß", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const m = await measureImageBuffer(png);
    expect(m.clipping.highlights).toBe(1);
  });
});

