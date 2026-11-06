import { BlobReader, BlobWriter, Uint8ArrayReader, ZipReader, ZipWriter, type FileEntry } from "@zip.js/zip.js";
import { orientation } from "exifr";
import { imageSize } from "image-size";
import { isPilotRecord, type PilotPhotoInfo, type PilotRecord, type PilotResult } from "./pilot-record";

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 256 * 1024;
export const MAX_PILOT_ARCHIVE_BYTES = 21 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const MIME_BY_TYPE = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type MediaType = PilotPhotoInfo["mediaType"];
type InspectedPhoto = { bytes: Uint8Array<ArrayBuffer>; info: PilotPhotoInfo };
export type PilotArchiveInput = {
  label: string;
  attempt: string;
  scaleWeightKg: string | null;
  photos: { top: File; side: File };
  result: PilotResult | null;
};
export type OpenedPilotArchive = { record: PilotRecord; photos: { top: File; side: File } };

function filenamePrefix(label: string, attempt: string): string {
  const prefix = `${label}-${attempt}`.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
  return prefix || "pigweigh-pilot";
}
export function pilotArchiveFilename(label: string, attempt: string): string {
  return `${filenamePrefix(label, attempt)}.zip`;
}
export function pilotPhotoFilename(label: string, attempt: string, view: "top" | "side", mediaType: string): string {
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/png" ? "png" : mediaType === "image/webp" ? "webp" : "bin";
  return `${filenamePrefix(label, attempt)}-${view}.${extension}`;
}
function fail(message: string): never { throw new Error(message); }
function uint32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset < 0 || offset + 4 > bytes.length) return fail("The image is incomplete.");
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0, littleEndian);
}
function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}
function stillImageExif(bytes: Uint8Array, mediaType: MediaType): Uint8Array | null {
  if (mediaType === "image/png") {
    let offset = 8;
    let hasEnd = false;
    let hasData = false;
    while (offset + 12 <= bytes.length) {
      const length = uint32(bytes, offset, false);
      if (length > bytes.length - offset - 12) return fail("The PNG is incomplete.");
      const chunk = ascii(bytes, offset + 4, 4);
      if (chunk === "acTL" || chunk === "fcTL" || chunk === "fdAT") return fail("Use a single still image for each view.");
      if (chunk === "IDAT") hasData = true;
      offset += length + 12;
      if (chunk === "IEND") { hasEnd = offset === bytes.length; break; }
    }
    if (!hasEnd || !hasData) return fail("The PNG is incomplete.");
    return bytes;
  }
  if (mediaType === "image/webp") {
    if (bytes.length < 20 || uint32(bytes, 4, true) + 8 !== bytes.length) return fail("The WebP is incomplete.");
    let offset = 12;
    let image = false;
    let exif: Uint8Array | null = null;
    while (offset + 8 <= bytes.length) {
      const chunk = ascii(bytes, offset, 4);
      const length = uint32(bytes, offset + 4, true);
      const end = offset + 8 + length + (length % 2);
      if (end > bytes.length) return fail("The WebP is incomplete.");
      if (chunk === "ANIM" || chunk === "ANMF" || (chunk === "VP8X" && length > 0 && (bytes[offset + 8] & 0x02) !== 0)) return fail("Use a single still image for each view.");
      if (chunk === "VP8 " || chunk === "VP8L") { if (image) return fail("Use a single still image for each view."); image = true; }
      if (chunk === "EXIF") {
        if (exif) return fail("The WebP has ambiguous metadata.");
        exif = bytes.subarray(offset + 8, offset + 8 + length);
        if (ascii(exif, 0, 6) === "Exif\0\0") exif = exif.subarray(6);
      }
      offset = end;
    }
    if (offset !== bytes.length || !image) return fail("The WebP is incomplete.");
    return exif;
  }
  // JPEG multi-picture files carry an MPF APP2 segment; ordinary stills do not.
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset++] !== 0xff) return fail("The JPEG is incomplete.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) return fail("The JPEG is incomplete.");
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length) return fail("The JPEG is incomplete.");
    if (marker === 0xe2 && ascii(bytes, offset + 2, 4) === "MPF\0") return fail("Use a single still image for each view.");
    offset += length;
  }
  return bytes;
}
async function inspectPhoto(file: Blob, view: "top" | "side"): Promise<InspectedPhoto> {
  if (file.size < 1 || file.size > MAX_PHOTO_BYTES) return fail("Each photo must be at most 10 MiB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  let size: ReturnType<typeof imageSize>;
  try { size = imageSize(bytes); } catch { return fail("Use a decodable JPEG, PNG or WebP photo."); }
  if (size.type !== "jpg" && size.type !== "png" && size.type !== "webp") return fail("Use a JPEG, PNG or WebP photo.");
  const mediaType = MIME_BY_TYPE[size.type];
  if (file.type && file.type !== mediaType) return fail("A photo's format does not match its file type.");
  if (!Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || size.width < 1 || size.height < 1 || size.width * size.height > MAX_PIXELS) return fail("Each photo must contain at most 20 megapixels.");
  const exif = stillImageExif(bytes, mediaType);
  let exifOrientation: number | undefined;
  try { exifOrientation = exif ? await orientation(exif) : undefined; } catch { return fail("The photo metadata could not be read safely."); }
  if (exifOrientation !== undefined && (!Number.isInteger(exifOrientation) || exifOrientation < 1 || exifOrientation > 8)) return fail("The photo orientation is invalid.");
  const swap = exifOrientation !== undefined && exifOrientation >= 5;
  const width = swap ? size.height : size.width;
  const height = swap ? size.width : size.height;
  if (typeof createImageBitmap !== "function") return fail("This browser cannot safely inspect the photo. Try a supported browser.");
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(new Blob([bytes], { type: mediaType }), { imageOrientation: "from-image" }); }
  catch { return fail("A photo could not be decoded."); }
  try { if (bitmap.width !== width || bitmap.height !== height) return fail("The browser could not verify the photo orientation."); }
  finally { bitmap.close(); }
  if (!globalThis.crypto?.subtle) return fail("This browser cannot verify the archive. Use a secure browser connection.");
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const sha256 = [...digest].map((part) => part.toString(16).padStart(2, "0")).join("");
  const extension = mediaType === "image/jpeg" ? "jpg" : mediaType === "image/png" ? "png" : "webp";
  return { bytes, info: { path: `photos/${view}.${extension}`, mediaType, byteLength: bytes.length, sha256, width, height } };
}
/** Inspect and hash the exact selected bytes before constructing provenance. */
export async function inspectPilotPhotos(photos: { top: File; side: File }): Promise<{ top: PilotPhotoInfo; side: PilotPhotoInfo }> {
  const [top, side] = await Promise.all([inspectPhoto(photos.top, "top"), inspectPhoto(photos.side, "side")]);
  return { top: top.info, side: side.info };
}
function matchingInfo(actual: PilotPhotoInfo, expected: PilotPhotoInfo): boolean {
  return actual.path === expected.path && actual.mediaType === expected.mediaType && actual.byteLength === expected.byteLength
    && actual.sha256 === expected.sha256 && actual.width === expected.width && actual.height === expected.height;
}
async function readEntry(entry: FileEntry, limit: number): Promise<Uint8Array<ArrayBuffer>> {
  if (entry.uncompressedSize < 1 || entry.uncompressedSize > limit || entry.compressedSize > MAX_PILOT_ARCHIVE_BYTES) return fail("An archive entry exceeds its allowed size.");
  let total = 0;
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  const sink = new WritableStream<Uint8Array>({
    write(chunk): void {
      total += chunk.byteLength;
      if (total > limit || total > entry.uncompressedSize) throw new Error("An archive entry exceeds its allowed size.");
      chunks.push(Uint8Array.from(chunk));
    },
  });
  await entry.getData(sink, { checkCrc32: true, checkOverlappingEntry: true, strictness: "strict", useWebWorkers: false });
  if (total !== entry.uncompressedSize) return fail("An archive entry has an incorrect size.");
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
  return combined;
}
async function writeArchive(record: PilotRecord, top: InspectedPhoto, side: InspectedPhoto): Promise<Blob> {
  if (!matchingInfo(top.info, record.photos.top) || !matchingInfo(side.info, record.photos.side)) return fail("The photo bytes or metadata do not match the archive record.");
  const manifest = new TextEncoder().encode(JSON.stringify(record));
  if (manifest.length > MAX_MANIFEST_BYTES) return fail("The record is too large to save.");
  const writer = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false, level: 0 });
  await writer.add("manifest.json", new Uint8ArrayReader(manifest));
  await writer.add(top.info.path, new Uint8ArrayReader(top.bytes));
  await writer.add(side.info.path, new Uint8ArrayReader(side.bytes));
  const archive = await writer.close();
  if (archive.size > MAX_PILOT_ARCHIVE_BYTES) return fail("The archive is too large to save.");
  return archive;
}
export async function createPilotArchive(input: PilotArchiveInput): Promise<Blob> {
  const [top, side] = await Promise.all([inspectPhoto(input.photos.top, "top"), inspectPhoto(input.photos.side, "side")]);
  const candidate: unknown = { schemaVersion: 1, createdAt: new Date().toISOString(), label: input.label.trim(), attempt: input.attempt.trim(),
    scaleWeightKg: input.scaleWeightKg?.trim() || null, photos: { top: top.info, side: side.info }, result: input.result };
  if (!isPilotRecord(candidate)) return fail("The record is incomplete or its provenance does not match these photos.");
  return writeArchive(candidate, top, side);
}
/** Re-save an opened record without changing its timestamp or historical result. */
export async function copyPilotArchive(opened: OpenedPilotArchive): Promise<Blob> {
  if (!isPilotRecord(opened.record)) return fail("The archive record is unsupported or invalid.");
  const [top, side] = await Promise.all([inspectPhoto(opened.photos.top, "top"), inspectPhoto(opened.photos.side, "side")]);
  return writeArchive(opened.record, top, side);
}
export async function openPilotArchive(file: Blob): Promise<OpenedPilotArchive> {
  if (file.size < 1 || file.size > MAX_PILOT_ARCHIVE_BYTES) return fail("The archive must be at most 21 MiB.");
  const reader = new ZipReader(new BlobReader(file), { strictness: "strict", filenameValidation: "strict", useWebWorkers: false });
  try {
    const entries: FileEntry[] = [];
    for await (const entry of reader.getEntriesGenerator()) {
      if (entry.directory || entry.symlink || entry.encrypted || entry.executable || entry.zip64 || ![0, 8].includes(entry.compressionMethod)) return fail("This archive contains an unsupported entry.");
      entries.push(entry);
      if (entries.length > 3) return fail("This archive contains unexpected entries.");
    }
    if (entries.length !== 3 || new Set(entries.map((entry) => entry.filename)).size !== 3) return fail("This archive is incomplete or contains duplicate entries.");
    const manifestEntry = entries.find((entry) => entry.filename === "manifest.json");
    if (!manifestEntry) return fail("This archive has no supported record.");
    const manifestBytes = await readEntry(manifestEntry, MAX_MANIFEST_BYTES);
    let raw: unknown;
    try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)); }
    catch { return fail("The archive record is malformed."); }
    if (!isPilotRecord(raw)) return fail("The archive record is unsupported or invalid.");
    const topEntry = entries.find((entry) => entry.filename === raw.photos.top.path);
    const sideEntry = entries.find((entry) => entry.filename === raw.photos.side.path);
    if (!topEntry || !sideEntry) return fail("The photos do not match the archive record.");
    const topBytes = await readEntry(topEntry, MAX_PHOTO_BYTES);
    const sideBytes = await readEntry(sideEntry, MAX_PHOTO_BYTES);
    const topFile = new File([topBytes], raw.photos.top.path.split("/")[1], { type: raw.photos.top.mediaType });
    const sideFile = new File([sideBytes], raw.photos.side.path.split("/")[1], { type: raw.photos.side.mediaType });
    const [top, side] = await Promise.all([inspectPhoto(topFile, "top"), inspectPhoto(sideFile, "side")]);
    if (!matchingInfo(top.info, raw.photos.top) || !matchingInfo(side.info, raw.photos.side)) return fail("The photo bytes or metadata do not match the archive record.");
    return { record: raw, photos: { top: topFile, side: sideFile } };
  } catch (error: unknown) {
    if (error instanceof Error && /^(The |This |An |Each |Use |A )/.test(error.message)) throw error;
    return fail("The archive is malformed, unsafe, or unsupported.");
  } finally { await reader.close(); }
}

