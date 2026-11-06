import { describe, expect, it } from "vitest";
import { cctAndDuv, deltaE2000, labToCctDuv, labToHex, srgb8ToLab, xyzToUv } from "@/lib/measure/color";

/** x, y chromaticity -> CIE 1960 (u, v) with Y = 1. */
function uvFromXy(x: number, y: number): [number, number] {
  return xyzToUv(x / y, 1, (1 - x - y) / y);
}

describe("sRGB -> CIE Lab", () => {
  it("trifft Referenzwerte", () => {
    const white = srgb8ToLab(255, 255, 255);
    expect(white.L).toBeCloseTo(100, 2);
    expect(white.a).toBeCloseTo(0, 2);
    expect(white.b).toBeCloseTo(0, 2);
    const red = srgb8ToLab(255, 0, 0);
    expect(red.L).toBeCloseTo(53.24, 1);
    expect(red.a).toBeCloseTo(80.09, 1);
    expect(red.b).toBeCloseTo(67.2, 1);
    expect(srgb8ToLab(119, 119, 119).L).toBeCloseTo(50, 0);
  });

  it("ist umkehrbar", () => {
    expect(labToHex(srgb8ToLab(18, 140, 201))).toBe("#128CC9");
  });
});

describe("CIEDE2000", () => {
  // Test data from Sharma, Wu & Dalal (2005), Table 1.
  it.each([
    [{ L: 50, a: 2.6772, b: -79.7751 }, { L: 50, a: 0, b: -82.7485 }, 2.0425],
    [{ L: 50, a: 3.1571, b: -77.2803 }, { L: 50, a: 0, b: -82.7485 }, 2.8615],
    [{ L: 50, a: 2.5, b: 0 }, { L: 73, a: 25, b: -18 }, 27.1492],
    [{ L: 60.2574, a: -34.0099, b: 36.2677 }, { L: 60.4626, a: -34.1751, b: 39.4387 }, 1.2644],
    [{ L: 2.0776, a: 0.0795, b: -1.135 }, { L: 0.9033, a: -0.0636, b: -0.5514 }, 0.9082],
  ])("Paar %#", (a, b, expected) => {
    expect(deltaE2000(a, b)).toBeCloseTo(expected, 4);
  });
});

describe("CCT und Duv", () => {
  it("D65 liegt bei 6504 K, leicht oberhalb der Planck-Kurve", () => {
    const { kelvin, duv } = cctAndDuv(...uvFromXy(0.31271, 0.32902));
    expect(Math.abs(kelvin - 6504)).toBeLessThan(15);
    expect(duv).toBeCloseTo(0.0032, 3);
  });

  it("Normlicht A liegt bei 2856 K auf der Kurve", () => {
    const { kelvin, duv } = cctAndDuv(...uvFromXy(0.44757, 0.40745));
    expect(Math.abs(kelvin - 2856)).toBeLessThan(5);
    expect(Math.abs(duv)).toBeLessThan(0.0005);
  });

  it("neutrales Grau im sRGB entspricht D65", () => {
    expect(Math.abs(labToCctDuv({ L: 50, a: 0, b: 0 }).kelvin - 6504)).toBeLessThan(15);
  });

  it("warmes Grau hat weniger Kelvin, grünliches Grau ein höheres Duv", () => {
    expect(labToCctDuv({ L: 50, a: 0, b: 10 }).kelvin).toBeLessThan(5600);
    expect(labToCctDuv({ L: 50, a: -6, b: 0 }).duv).toBeGreaterThan(labToCctDuv({ L: 50, a: 6, b: 0 }).duv);
  });
});
