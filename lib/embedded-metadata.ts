/*
 * Writes stock metadata (title, description, keywords) into a JPEG as XMP
 * (APP1) and IPTC-IIM (APP13 / Photoshop IRB). Runs entirely in the browser
 * on the user's original file: the full-resolution image never reaches the
 * AuraLens server. Stock portals read these fields when a file is uploaded
 * (e.g. Adobe Stock, Shutterstock; Pexels takes title and up to 30 tags).
 *
 * Image data is copied byte for byte - only metadata segments change.
 */

export type EmbeddableMetadata = {
  title: string;
  description: string;
  keywords: string[];
};

export class NotAJpegError extends Error {
  constructor() {
    super("Die Datei ist kein JPEG.");
    this.name = "NotAJpegError";
  }
}

export class InvalidJpegError extends Error {
  constructor(reason: string) {
    super(`JPEG-Struktur nicht lesbar: ${reason}`);
    this.name = "InvalidJpegError";
  }
}

const XMP_HEADER = "http://ns.adobe.com/xap/1.0/\0";
const XMP_EXTENSION_HEADER = "http://ns.adobe.com/xmp/extension/\0";
const PHOTOSHOP_HEADER = "Photoshop 3.0\0";
/** Photoshop image resource ids: IPTC-NAA record and its MD5 digest. */
const IRB_IPTC = 0x0404;
const IRB_IPTC_DIGEST = 0x0425;
const MAX_SEGMENT_PAYLOAD = 65533;

const encoder = new TextEncoder();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function cleanKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of keywords) {
    const keyword = raw.trim();
    if (!keyword || seen.has(keyword.toLowerCase())) continue;
    seen.add(keyword.toLowerCase());
    result.push(keyword);
  }
  return result;
}

/** The `x:xmpmeta` block, usable inside a JPEG and as a `.xmp` sidecar file. */
export function buildXmpMeta(meta: EmbeddableMetadata): string {
  const keywords = cleanKeywords(meta.keywords)
    .map((keyword) => `     <rdf:li>${escapeXml(keyword)}</rdf:li>`)
    .join("\n");
  return [
    `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="AuraLens">`,
    ` <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">`,
    `  <rdf:Description rdf:about=""`,
    `    xmlns:dc="http://purl.org/dc/elements/1.1/"`,
    `    xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"`,
    `    photoshop:Headline="${escapeXml(meta.title)}">`,
    `   <dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.title)}</rdf:li></rdf:Alt></dc:title>`,
    `   <dc:description><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(meta.description)}</rdf:li></rdf:Alt></dc:description>`,
    `   <dc:subject>`,
    `    <rdf:Bag>`,
    keywords,
    `    </rdf:Bag>`,
    `   </dc:subject>`,
    `  </rdf:Description>`,
    ` </rdf:RDF>`,
    `</x:xmpmeta>`,
  ].join("\n");
}

/** Sidecar for RAW files (`IMG_1234.xmp` next to `IMG_1234.CR3`). */
export function buildXmpSidecar(meta: EmbeddableMetadata): string {
  return `${buildXmpMeta(meta)}\n`;
}

function xmpPacket(meta: EmbeddableMetadata): string {
  // Padding lets other tools edit the packet in place later.
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n${buildXmpMeta(meta)}\n${" ".repeat(
    1024
  )}\n<?xpacket end="w"?>`;
}

/** Cuts a string so its UTF-8 encoding fits `maxBytes`, never inside a character. */
function utf8Truncate(value: string, maxBytes: number): Uint8Array {
  let bytes = encoder.encode(value);
  if (bytes.length <= maxBytes) return bytes;
  let text = value;
  while (bytes.length > maxBytes) {
    text = Array.from(text).slice(0, -1).join("");
    bytes = encoder.encode(text);
  }
  return bytes;
}

function iimDataset(record: number, dataset: number, data: Uint8Array): number[] {
  return [0x1c, record, dataset, (data.length >> 8) & 0xff, data.length & 0xff, ...data];
}

/** IPTC-IIM record with the IIM length limits (ObjectName 64, Headline 256, Caption 2000, Keyword 64 bytes). */
export function buildIptcRecord(meta: EmbeddableMetadata): Uint8Array {
  const bytes: number[] = [];
  // 1:90 CodedCharacterSet = UTF-8 (ESC % G)
  bytes.push(...iimDataset(1, 90, new Uint8Array([0x1b, 0x25, 0x47])));
  bytes.push(...iimDataset(2, 0, new Uint8Array([0x00, 0x04]))); // RecordVersion 4
  bytes.push(...iimDataset(2, 5, utf8Truncate(meta.title, 64)));
  for (const keyword of cleanKeywords(meta.keywords)) bytes.push(...iimDataset(2, 25, utf8Truncate(keyword, 64)));
  bytes.push(...iimDataset(2, 105, utf8Truncate(meta.title, 256)));
  bytes.push(...iimDataset(2, 120, utf8Truncate(meta.description, 2000)));
  return new Uint8Array(bytes);
}

type IrbResource = { id: number; name: Uint8Array; data: Uint8Array };

function parseIrb(payload: Uint8Array): IrbResource[] | null {
  const resources: IrbResource[] = [];
  let p = 0;
  while (p + 12 <= payload.length) {
    if (String.fromCharCode(...payload.subarray(p, p + 4)) !== "8BIM") return null;
    const id = (payload[p + 4] << 8) | payload[p + 5];
    const nameLength = payload[p + 6];
    const namePadded = (nameLength + 1) % 2 === 0 ? nameLength + 1 : nameLength + 2;
    const name = payload.subarray(p + 6, p + 6 + namePadded);
    const sizeAt = p + 6 + namePadded;
    if (sizeAt + 4 > payload.length) return null;
    const size = new DataView(payload.buffer, payload.byteOffset + sizeAt, 4).getUint32(0);
    const dataAt = sizeAt + 4;
    if (dataAt + size > payload.length) return null;
    resources.push({ id, name, data: payload.subarray(dataAt, dataAt + size) });
    p = dataAt + size + (size % 2);
  }
  return resources;
}

function serializeIrb(resources: IrbResource[]): Uint8Array {
  const parts: number[] = [];
  for (const resource of resources) {
    parts.push(0x38, 0x42, 0x49, 0x4d, (resource.id >> 8) & 0xff, resource.id & 0xff);
    parts.push(...(resource.name.length ? resource.name : [0, 0]));
    const size = resource.data.length;
    parts.push((size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff);
    parts.push(...resource.data);
    if (size % 2) parts.push(0);
  }
  return new Uint8Array(parts);
}

function startsWith(data: Uint8Array, prefix: string): boolean {
  if (data.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (data[i] !== prefix.charCodeAt(i)) return false;
  return true;
}

function segment(marker: number, payload: Uint8Array): Uint8Array {
  if (payload.length > MAX_SEGMENT_PAYLOAD) throw new InvalidJpegError("Metadaten zu groß");
  const out = new Uint8Array(4 + payload.length);
  out[0] = 0xff;
  out[1] = marker;
  out[2] = ((payload.length + 2) >> 8) & 0xff;
  out[3] = (payload.length + 2) & 0xff;
  out.set(payload, 4);
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let p = 0;
  for (const part of parts) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

/**
 * Returns a copy of the JPEG with AuraLens' XMP and IPTC metadata. Existing
 * XMP and IPTC are replaced; EXIF, ICC profile and all other Photoshop
 * resources are kept unchanged.
 */
export function embedMetadataInJpeg(bytes: Uint8Array, meta: EmbeddableMetadata): Uint8Array {
  if (!isJpeg(bytes)) throw new NotAJpegError();

  const kept: Uint8Array[] = [];
  let otherIrb: IrbResource[] = [];
  let p = 2;

  while (p < bytes.length) {
    if (bytes[p] !== 0xff) throw new InvalidJpegError(`Marker erwartet bei Byte ${p}`);
    const marker = bytes[p + 1];
    if (marker === 0xff) {
      p++; // fill byte
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image: rest is copied as is
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(bytes.subarray(p, p + 2));
      p += 2;
      continue;
    }
    if (p + 4 > bytes.length) throw new InvalidJpegError("Segment abgeschnitten");
    const length = (bytes[p + 2] << 8) | bytes[p + 3];
    if (length < 2 || p + 2 + length > bytes.length) throw new InvalidJpegError("ungültige Segmentlänge");
    const payload = bytes.subarray(p + 4, p + 2 + length);

    const isOldXmp = marker === 0xe1 && (startsWith(payload, XMP_HEADER) || startsWith(payload, XMP_EXTENSION_HEADER));
    if (marker === 0xed && startsWith(payload, PHOTOSHOP_HEADER)) {
      const resources = parseIrb(payload.subarray(PHOTOSHOP_HEADER.length));
      if (resources) otherIrb = otherIrb.concat(resources.filter((r) => r.id !== IRB_IPTC && r.id !== IRB_IPTC_DIGEST));
    } else if (!isOldXmp) {
      kept.push(bytes.subarray(p, p + 2 + length));
    }
    p += 2 + length;
  }
  if (p >= bytes.length) throw new InvalidJpegError("keine Bilddaten gefunden");

  const xmp = segment(0xe1, concat([encoder.encode(XMP_HEADER), encoder.encode(xmpPacket(meta))]));
  const irb = serializeIrb([...otherIrb, { id: IRB_IPTC, name: new Uint8Array(0), data: buildIptcRecord(meta) }]);
  const photoshop = segment(0xed, concat([encoder.encode(PHOTOSHOP_HEADER), irb]));

  // New metadata goes right after the leading APPn segments (JFIF, EXIF, ICC ...).
  let insertAt = 0;
  while (insertAt < kept.length && kept[insertAt][1] >= 0xe0 && kept[insertAt][1] <= 0xef) insertAt++;
  const head = [...kept.slice(0, insertAt), xmp, photoshop, ...kept.slice(insertAt)];
  return concat([bytes.subarray(0, 2), ...head, bytes.subarray(p)]);
}
