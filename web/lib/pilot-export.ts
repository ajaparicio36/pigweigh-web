import { strToU8, zipSync } from "fflate";
import type { Estimate, PhotoView } from "./api";
import { isDiagnostic } from "./measurement-diagnostics";

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

async function renderInspection(file: File, data: unknown): Promise<Uint8Array> {
  if (!isDiagnostic(data)) throw new Error("Measurement overlay data is missing.");
  const url = URL.createObjectURL(file);
  const canvas = document.createElement("canvas");
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1800 / Math.max(data.width, data.height));
    canvas.width = Math.round(data.width * scale);
    canvas.height = Math.round(data.height * scale);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not draw the inspection image.");
    context.scale(canvas.width / data.width, canvas.height / data.height);
    context.drawImage(image, 0, 0, data.width, data.height);
    context.lineWidth = 3 / scale;
    context.strokeStyle = "#ffc849";
    context.beginPath();
    data.marker.forEach(([x, y], index) => index === 0 ? context.moveTo(x, y) : context.lineTo(x, y));
    context.closePath();
    context.stroke();
    for (const [name, [[x1, y1], [x2, y2]]] of Object.entries(data.lines)) {
      context.strokeStyle = name === "shoulder_reference" ? "#ffb02f" : "#42f5e9";
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    }
    context.fillStyle = "#fff";
    context.strokeStyle = "#222";
    context.lineWidth = 2 / scale;
    for (const [x, y] of Object.values(data.landmarks)) {
      context.beginPath();
      context.arc(x, y, Math.max(data.width, data.height) / 125, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    }
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("Could not save the inspection image.")), "image/png");
    });
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = 0;
    canvas.height = 0;
  }
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
  const topInspection = await renderInspection(top, estimate.diagnostics?.top);
  const sideInspection = await renderInspection(side, estimate.diagnostics?.side);
  const topInspectionName = `${prefix}_top_inspected.png`;
  const sideInspectionName = `${prefix}_side_inspected.png`;
  const exportedAt = new Date().toISOString();
  const summary = {
    pig_id: pigId,
    attempt_number: Number(attempt),
    exported_at: exportedAt,
    top_photo: names.top,
    side_photo: names.side,
    top_inspected_photo: topInspectionName,
    side_inspected_photo: sideInspectionName,
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
    [topInspectionName]: topInspection,
    [sideInspectionName]: sideInspection,
    "estimate.csv": strToU8(csv + "\r\n"),
    "estimate.json": strToU8(JSON.stringify({ ...summary, ...estimate }, null, 2) + "\n"),
  }, { level: 0 });
  return new Blob([Uint8Array.from(archive)], { type: "application/zip" });
}
