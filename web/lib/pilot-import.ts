import { unzipSync } from "fflate";
import { MAX_PHOTO_BYTES } from "./camera";

const photoName = /^([A-Z0-9][A-Z0-9_-]{0,31})_A(\d{2,4})_(top|side)\.(jpe?g|png|webp)$/i;

export async function readPilotPair(archive: File) {
  if (archive.size > 6 * MAX_PHOTO_BYTES) throw new Error("Choose a pilot ZIP under 60 MB.");
  const names = new Set<string>();
  const photos = unzipSync(new Uint8Array(await archive.arrayBuffer()), { filter: (entry) => {
    if (!photoName.test(entry.name)) return false;
    if (entry.originalSize <= 0 || entry.originalSize > MAX_PHOTO_BYTES
        || names.size >= 2 || names.has(entry.name)) {
      throw new Error("The ZIP must contain one original top and side photo, each under 10 MB.");
    }
    names.add(entry.name);
    return true;
  } });
  const entries = Object.entries(photos).map(([name, bytes]) => {
    const match = photoName.exec(name)!;
    const extension = match[4].toLowerCase();
    const type = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
    return { id: match[1].toUpperCase(), attempt: Number(match[2]), view: match[3].toLowerCase(),
      file: new File([Uint8Array.from(bytes)], name, { type }) };
  });
  const top = entries.find((entry) => entry.view === "top");
  const side = entries.find((entry) => entry.view === "side");
  if (!top || !side || top.id !== side.id || !top.attempt || top.attempt !== side.attempt) {
    throw new Error("Choose a pilot ZIP with matching top and side photos from one attempt.");
  }
  return { id: top.id, attempt: String(top.attempt), top: top.file, side: side.file };
}
