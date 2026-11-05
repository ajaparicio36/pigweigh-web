import { strToU8, zipSync } from "fflate";
import type { Estimate, PhotoView } from "./api";

export function pilotPhotoName(prefix: string, file: File, view: PhotoView): string {
  const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  return `${prefix}_${view}.${extension}`;
}

export function downloadPilotFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function createPilotArchive(
  pigId: string,
  attempt: string,
  top: File,
  side: File,
  estimate: Estimate,
): Promise<Blob> {
  const prefix = `${pigId}_A${attempt.padStart(2, "0")}`;
  const names = { top: pilotPhotoName(prefix, top, "top"), side: pilotPhotoName(prefix, side, "side") };
  const [topBytes, sideBytes] = await Promise.all([top.arrayBuffer(), side.arrayBuffer()]);
  const exportedAt = new Date().toISOString();
  const summary = {
    pig_id: pigId,
    attempt_number: Number(attempt),
    exported_at: exportedAt,
    top_photo: names.top,
    side_photo: names.side,
    ...estimate.measurements,
    estimated_weight_kg: estimate.estimated_weight_kg,
    formula: estimate.method.formula,
    method_version: estimate.method.version,
    marker_dictionary: estimate.method.marker_dictionary,
    marker_id: estimate.method.marker_id,
    marker_side_mm: estimate.method.marker_side_mm,
    pose_bundle_id: estimate.artifacts.bundle_id,
    scale_weight_kg: "",
  };
  const csv = [Object.keys(summary), Object.values(summary)]
    .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
  const archive = zipSync({
    [names.top]: new Uint8Array(topBytes),
    [names.side]: new Uint8Array(sideBytes),
    "estimate.csv": strToU8(csv + "\r\n"),
    "estimate.json": strToU8(JSON.stringify({ ...summary, ...estimate }, null, 2) + "\n"),
  }, { level: 0 });
  return new Blob([Uint8Array.from(archive)], { type: "application/zip" });
}
