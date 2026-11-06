import { isEstimate, type Estimate } from "./api";

export const TOP_LANDMARKS = ["snout-tip", "left-ear-base", "right-ear-base", "left-shoulder", "right-shoulder", "left-chest", "right-chest", "left-hip", "right-hip", "tail-base", "spine-midpoint"] as const;
export const SIDE_LANDMARKS = ["snout-tip", "eye", "ear-tip", "withers", "mid-point-peak", "loin", "tail-base", "front-shoulder-joint", "front-hoof", "rear-hip-joint", "rear-hoof", "sternum", "belly-lowest-part"] as const;
export const TOP_ANCHORS = ["left-ear-base", "right-ear-base", "tail-base", "left-chest", "right-chest"] as const;
export const SIDE_ANCHORS = ["withers", "sternum"] as const;
export type TopLandmark = typeof TOP_LANDMARKS[number];
export type SideLandmark = typeof SIDE_LANDMARKS[number];
export type TopAnchor = typeof TOP_ANCHORS[number];
export type SideAnchor = typeof SIDE_ANCHORS[number];
export type PilotPoint = readonly [number, number];
export type PilotSegment = readonly [PilotPoint, PilotPoint];
export type PilotMeasuredPoints = { top: Record<TopAnchor, PilotPoint>; side: Record<SideAnchor, PilotPoint> };
export type PilotMeasuredSegments = { top: { bodyLength: PilotSegment; chestWidth: PilotSegment }; side: { chestDepth: PilotSegment } };
export type PilotDetection = { detected: PilotPoint | null; used: PilotPoint | null; confidence: number | null; withinImage: boolean | null };
export type PilotLandmarks = { top: Record<TopLandmark, PilotDetection>; side: Record<SideLandmark, PilotDetection> };
export type PilotOverrides = { top: Partial<Record<TopAnchor, PilotPoint>>; side: Partial<Record<SideAnchor, PilotPoint>> };
export type PilotProvenance = {
  version: 1;
  source: "automatic" | "manually_adjusted";
  bundleId: string;
  methodVersion: string;
  imageSha256: { top: string; side: string };
  landmarks: PilotLandmarks | null;
  overrides: PilotOverrides;
};
export type PilotDiagnosticView = {
  width: number;
  height: number;
  imageSha256: string;
  imageToMarker: readonly [number, number, number, number, number, number, number, number, number];
  segments: Record<string, PilotSegment>;
};
export type PilotDiagnostics = {
  version: 1;
  coordinateSpace: "exif-oriented-pixels";
  top: PilotDiagnosticView & { segments: PilotMeasuredSegments["top"] };
  side: PilotDiagnosticView & { segments: PilotMeasuredSegments["side"] };
};
export type PilotResult = { estimate: Estimate; provenance: PilotProvenance; diagnostics: PilotDiagnostics | null };
export type PilotPhotoInfo = {
  path: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  byteLength: number;
  sha256: string;
  width: number;
  height: number;
};
export type PilotRecord = {
  schemaVersion: 1;
  createdAt: string;
  label: string;
  attempt: string;
  scaleWeightKg: string | null;
  photos: { top: PilotPhotoInfo; side: PilotPhotoInfo };
  result: PilotResult | null;
};

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}
function text(value: unknown, limit: number): value is string {
  return typeof value === "string" && value.length <= limit && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value);
}
function sha256(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}
function point(value: unknown): value is PilotPoint {
  return Array.isArray(value) && value.length === 2 && value.every((part: unknown) => typeof part === "number" && Number.isFinite(part));
}
function inside(value: PilotPoint, width: number, height: number): boolean {
  return value[0] >= 0 && value[0] < width && value[1] >= 0 && value[1] < height;
}
function samePoint(a: PilotPoint, b: PilotPoint): boolean { return a[0] === b[0] && a[1] === b[1]; }
function isPhotoInfo(value: unknown, view: "top" | "side"): value is PilotPhotoInfo {
  if (!record(value) || !exactKeys(value, ["path", "mediaType", "byteLength", "sha256", "width", "height"])) return false;
  const extensions: Record<PilotPhotoInfo["mediaType"], string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
  if (value.mediaType !== "image/jpeg" && value.mediaType !== "image/png" && value.mediaType !== "image/webp") return false;
  return value.path === `photos/${view}.${extensions[value.mediaType]}` && Number.isSafeInteger(value.byteLength) && typeof value.byteLength === "number" && value.byteLength > 0 && value.byteLength <= 10 * 1024 * 1024
    && sha256(value.sha256) && Number.isSafeInteger(value.width) && typeof value.width === "number" && value.width > 0
    && Number.isSafeInteger(value.height) && typeof value.height === "number" && value.height > 0 && value.width * value.height <= 20_000_000;
}
function isEstimateSnapshot(value: unknown): value is Estimate {
  if (!isEstimate(value) || !record(value)) return false;
  const keys = ["status", "estimated_weight_kg", "artifacts", "measurements", "method", "valuation"];
  if (value.valuation === null) keys.push("valuation_unavailable_reason");
  if (!exactKeys(value, keys) || !record(value.artifacts) || !exactKeys(value.artifacts, ["bundle_id"])
    || !record(value.measurements) || !exactKeys(value.measurements, ["body_length_cm", "chest_width_cm", "chest_depth_cm", "girth_cm"])
    || !record(value.method) || !exactKeys(value.method, ["version", "formula", "marker_dictionary", "marker_id", "marker_side_mm", "experimental", "accuracy_evaluated"])) return false;
  return value.valuation === null || (record(value.valuation) && exactKeys(value.valuation, ["amount_php", "price"])
    && record(value.valuation.price) && exactKeys(value.valuation.price, ["id", "php_per_kg", "source_reference", "published_at"]));
}
export function inversePilotHomography(matrix: readonly number[]): number[] | null {
  if (matrix.length !== 9 || !matrix.every(Number.isFinite)) return null;
  const scale = Math.max(...matrix.map(Math.abs));
  if (!Number.isFinite(scale) || scale === 0) return null;
  const [a, b, c, d, e, f, g, h, i] = matrix.map((part) => part / scale);
  const adjugate = [e*i-f*h, c*h-b*i, b*f-c*e, f*g-d*i, a*i-c*g, c*d-a*f, d*h-e*g, b*g-a*h, a*e-b*d];
  const determinant = a*adjugate[0] + b*adjugate[3] + c*adjugate[6];
  if (!Number.isFinite(determinant) || determinant === 0) return null;
  const result = adjugate.map((part) => part / determinant);
  return result.every(Number.isFinite) ? result : null;
}
export function projectPilotPoint(matrix: readonly number[], p: PilotPoint): PilotPoint | null {
  if (matrix.length !== 9 || !matrix.every(Number.isFinite) || !p.every(Number.isFinite)) return null;
  const [a,b,c,d,e,f,g,h,i] = matrix;
  const denominator = g*p[0] + h*p[1] + i;
  const tolerance = Number.EPSILON * Math.max(1, Math.hypot(g,h,i) * Math.hypot(p[0],p[1],1)) * 32;
  if (!Number.isFinite(denominator) || Math.abs(denominator) <= tolerance) return null;
  const x = (a*p[0] + b*p[1] + c) / denominator;
  const y = (d*p[0] + e*p[1] + f) / denominator;
  return Number.isFinite(x) && Number.isFinite(y) ? [x,y] : null;
}
function isDiagnosticView(value: unknown, info: PilotPhotoInfo, names: readonly string[]): value is PilotDiagnosticView {
  if (!record(value) || !exactKeys(value, ["width", "height", "imageSha256", "imageToMarker", "segments"])
    || value.width !== info.width || value.height !== info.height || value.imageSha256 !== info.sha256
    || !Array.isArray(value.imageToMarker) || value.imageToMarker.length !== 9
    || !value.imageToMarker.every((item: unknown) => typeof item === "number" && Number.isFinite(item))
    || inversePilotHomography(value.imageToMarker as number[]) === null
    || !record(value.segments) || !exactKeys(value.segments, names)) return false;
  return names.every((name) => {
    const line = value.segments as Record<string, unknown>;
    return Array.isArray(line[name]) && line[name].length === 2 && point(line[name][0]) && point(line[name][1])
      && inside(line[name][0], info.width, info.height) && inside(line[name][1], info.width, info.height);
  });
}
function isDiagnostics(value: unknown, photos: PilotRecord["photos"]): value is PilotDiagnostics {
  return record(value) && exactKeys(value, ["version", "coordinateSpace", "top", "side"]) && value.version === 1
    && value.coordinateSpace === "exif-oriented-pixels" && isDiagnosticView(value.top, photos.top, ["bodyLength", "chestWidth"])
    && isDiagnosticView(value.side, photos.side, ["chestDepth"]);
}
function isOverrides(value: unknown, names: readonly string[], info: PilotPhotoInfo): value is Record<string, PilotPoint> {
  return record(value) && Object.entries(value).every(([name, position]) => names.includes(name) && point(position) && inside(position, info.width, info.height));
}
function isLandmarkView(value: unknown, names: readonly string[], anchors: readonly string[], overrides: Record<string, PilotPoint>, info: PilotPhotoInfo): boolean {
  if (!record(value) || !exactKeys(value, names)) return false;
  return names.every((name) => {
    const detection = value[name];
    if (!record(detection) || !exactKeys(detection, ["detected", "used", "confidence", "withinImage"])) return false;
    if (detection.detected === null) return detection.used === null && detection.confidence === null && detection.withinImage === null && !anchors.includes(name);
    if (!point(detection.detected) || (detection.confidence !== null && (typeof detection.confidence !== "number" || !Number.isFinite(detection.confidence) || detection.confidence < 0 || detection.confidence > 1))
      || detection.withinImage !== inside(detection.detected, info.width, info.height)) return false;
    if (!anchors.includes(name)) return detection.used === null && !Object.prototype.hasOwnProperty.call(overrides, name);
    if (!inside(detection.detected, info.width, info.height) || typeof detection.confidence !== "number" || detection.confidence < 0.5 || detection.confidence > 1
      || !point(detection.used) || !inside(detection.used, info.width, info.height)) return false;
    return samePoint(detection.used, overrides[name] ?? detection.detected);
  });
}
function isProvenance(value: unknown, estimate: Estimate, photos: PilotRecord["photos"]): value is PilotProvenance {
  if (!record(value) || !exactKeys(value, ["version", "source", "bundleId", "methodVersion", "imageSha256", "landmarks", "overrides"])
    || value.version !== 1 || (value.source !== "automatic" && value.source !== "manually_adjusted")
    || value.bundleId !== estimate.artifacts.bundle_id || value.methodVersion !== estimate.method.version
    || !record(value.imageSha256) || !exactKeys(value.imageSha256, ["top", "side"])
    || value.imageSha256.top !== photos.top.sha256 || value.imageSha256.side !== photos.side.sha256
    || !record(value.overrides) || !exactKeys(value.overrides, ["top", "side"])
    || !isOverrides(value.overrides.top, TOP_ANCHORS, photos.top) || !isOverrides(value.overrides.side, SIDE_ANCHORS, photos.side)) return false;
  const count = Object.keys(value.overrides.top).length + Object.keys(value.overrides.side).length;
  if (value.source === "automatic" && count !== 0) return false;
  if (value.source === "manually_adjusted" && (count === 0 || value.landmarks === null)) return false;
  if (value.landmarks === null) return value.source === "automatic";
  if (!record(value.landmarks) || !exactKeys(value.landmarks, ["top", "side"])
    || !isLandmarkView(value.landmarks.top, TOP_LANDMARKS, TOP_ANCHORS, value.overrides.top, photos.top)
    || !isLandmarkView(value.landmarks.side, SIDE_LANDMARKS, SIDE_ANCHORS, value.overrides.side, photos.side)) return false;
  if (value.source === "manually_adjusted") {
    const landmarks = value.landmarks as PilotLandmarks;
    return Object.entries(value.overrides.top).some(([name, edited]) => {
      const detected = landmarks.top[name as TopAnchor].detected;
      return detected !== null && !samePoint(detected, edited);
    }) || Object.entries(value.overrides.side).some(([name, edited]) => {
      const detected = landmarks.side[name as SideAnchor].detected;
      return detected !== null && !samePoint(detected, edited);
    });
  }
  return true;
}
/** Shared, perspective-correct geometry for read-only and editable overlays. */
export function pilotMeasuredSegments(points: PilotMeasuredPoints, topImageToMarker: readonly number[]): PilotMeasuredSegments | null {
  const inverseTransform = inversePilotHomography(topImageToMarker);
  const left = projectPilotPoint(topImageToMarker, points.top["left-ear-base"]);
  const right = projectPilotPoint(topImageToMarker, points.top["right-ear-base"]);
  if (!inverseTransform || !left || !right) return null;
  const midpoint = projectPilotPoint(inverseTransform, [(left[0]+right[0])/2, (left[1]+right[1])/2]);
  if (!midpoint) return null;
  return { top: { bodyLength: [midpoint, points.top["tail-base"]], chestWidth: [points.top["left-chest"], points.top["right-chest"]] },
    side: { chestDepth: [points.side.withers, points.side.sternum] } };
}
function diagnosticsMatch(diagnostics: PilotDiagnostics, landmarks: PilotLandmarks): boolean {
  const top = landmarks.top;
  const side = landmarks.side;
  const leftEar = top["left-ear-base"].used;
  const rightEar = top["right-ear-base"].used;
  const tail = top["tail-base"].used;
  const leftChest = top["left-chest"].used;
  const rightChest = top["right-chest"].used;
  const withers = side.withers.used;
  const sternum = side.sternum.used;
  if (!leftEar || !rightEar || !tail || !leftChest || !rightChest || !withers || !sternum) return false;
  const expected = pilotMeasuredSegments({ top: { "left-ear-base": leftEar, "right-ear-base": rightEar, "tail-base": tail,
    "left-chest": leftChest, "right-chest": rightChest }, side: { withers, sternum } }, diagnostics.top.imageToMarker);
  if (!expected) return false;
  const near = (a: PilotPoint, b: PilotPoint, view: PilotDiagnosticView): boolean =>
    Math.abs(a[0]-b[0]) <= Math.max(view.width,view.height) * 1e-6 + 1e-5
    && Math.abs(a[1]-b[1]) <= Math.max(view.width,view.height) * 1e-6 + 1e-5;
  const lineMatches = (actual: PilotSegment, wanted: PilotSegment, view: PilotDiagnosticView): boolean =>
    near(actual[0], wanted[0], view) && near(actual[1], wanted[1], view);
  return lineMatches(diagnostics.top.segments.bodyLength, expected.top.bodyLength, diagnostics.top)
    && lineMatches(diagnostics.top.segments.chestWidth, expected.top.chestWidth, diagnostics.top)
    && lineMatches(diagnostics.side.segments.chestDepth, expected.side.chestDepth, diagnostics.side);
}
export function isPilotRecord(value: unknown): value is PilotRecord {
  if (!record(value) || !exactKeys(value, ["schemaVersion", "createdAt", "label", "attempt", "scaleWeightKg", "photos", "result"])
    || value.schemaVersion !== 1 || typeof value.createdAt !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt)
    || !Number.isFinite(Date.parse(value.createdAt)) || !text(value.label, 80) || !text(value.attempt, 40)
    || !(value.scaleWeightKg === null || (typeof value.scaleWeightKg === "string" && /^(?:0|[1-9]\d{0,5})(?:\.\d{1,3})?$/.test(value.scaleWeightKg) && /[1-9]/.test(value.scaleWeightKg)))
    || !record(value.photos) || !exactKeys(value.photos, ["top", "side"]) || !isPhotoInfo(value.photos.top, "top") || !isPhotoInfo(value.photos.side, "side")) return false;
  if (value.result === null) return true;
  if (!record(value.result) || !exactKeys(value.result, ["estimate", "provenance", "diagnostics"]) || !isEstimateSnapshot(value.result.estimate)
    || !isProvenance(value.result.provenance, value.result.estimate, value.photos as PilotRecord["photos"])) return false;
  if (value.result.diagnostics === null) return value.result.provenance.source === "automatic";
  return isDiagnostics(value.result.diagnostics, value.photos as PilotRecord["photos"]) && value.result.provenance.landmarks !== null
    && diagnosticsMatch(value.result.diagnostics, value.result.provenance.landmarks);
}
