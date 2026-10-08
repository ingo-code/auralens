import sharp from "sharp";

// Keeps the longest edge within Claude's recommended vision input size,
// which avoids internal tiling and cuts input tokens for large photos.
const MAX_DIMENSION = 1568;
const JPEG_QUALITY = 82;

export type ProcessedImage = {
  data: Buffer;
  mediaType: "image/jpeg";
  /** Dimensions of the original upload (EXIF rotation applied), before downscaling. */
  originalWidth: number;
  originalHeight: number;
};

/**
 * Normalizes any supported upload (JPEG/PNG/WEBP/GIF) into a size- and
 * quality-capped JPEG before it goes to the Claude API. Reduces upload
 * cost/latency and sidesteps per-format media_type branching downstream.
 */
export async function compressImageForAnalysis(buffer: Buffer): Promise<ProcessedImage> {
  const image = sharp(buffer);
  const { autoOrient } = await image.metadata();

  const data = await image
    .rotate() // apply EXIF orientation before the metadata is stripped
    .resize({
      width: MAX_DIMENSION,
      height: MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();

  return {
    data,
    mediaType: "image/jpeg",
    originalWidth: autoOrient.width,
    originalHeight: autoOrient.height,
  };
}
