import sharp from "sharp";
import { MEASURE_LONG_EDGE, measurePixels, type ImageMeasurements } from "@/lib/measure/image-metrics";

/**
 * Decodes an upload into sRGB pixels at the fixed working size and measures
 * them. Embedded ICC profiles (Adobe RGB, Display P3, CMYK ...) are converted
 * to sRGB first, so values mean the same for every file.
 */
export async function measureImageBuffer(buffer: Buffer): Promise<ImageMeasurements> {
  const { data, info } = await sharp(buffer)
    .rotate()
    .resize({ width: MEASURE_LONG_EDGE, height: MEASURE_LONG_EDGE, fit: "inside", withoutEnlargement: true })
    .toColourspace("srgb")
    .flatten({ background: "#ffffff" }) // transparent areas count as white paper
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`Unerwartete Kanalzahl ${info.channels}`);
  return measurePixels(new Uint8Array(data.buffer, data.byteOffset, data.length), info.width, info.height);
}
