import { BlobReader, BlobWriter, TextReader, ZipWriter } from "@zip.js/zip.js";
import type { Estimate } from "./api";

export const ATTEMPTS_PER_PIG = 3;

export type RepeatAttempt = {
  number: number;
  hashes?: { top: string; side: string };
  savedAt: string;
  result: Estimate | null;
  failure: string | null;
  top: File | null;
  side: File | null;
};
export type BatchPhoto = { file: File; hash: string; savedAt?: string };
export type RepeatSession = { pig: string; scaleKg: string; attempts: RepeatAttempt[];
  createdAt?: string;
  pendingKeypointResults?: Record<string, Estimate>;
  batch?: { top: BatchPhoto[]; side: BatchPhoto[] } };

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("pigweigh-repeat-test", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("session");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function editSession(update?: (current: RepeatSession | null) => RepeatSession | null, pig?: string): Promise<RepeatSession | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", update ? "readwrite" : "readonly");
      const store = transaction.objectStore("session");
      const read = store.get("current");
      let current: RepeatSession | null = null;
      function apply(value: RepeatSession | undefined, key: string): void {
        try {
          current = value ?? null;
          if (update) {
            current = update(current);
            if (current) store.put(current, key);
            else store.delete(key);
          }
        } catch (error) {
          reject(error);
          transaction.abort();
        }
      }
      read.onsuccess = () => {
        const active = read.result as RepeatSession | undefined;
        if (pig === undefined || active?.pig === pig) {
          apply(active, "current");
        } else {
          const key = "pig:" + pig;
          const archived = store.get(key);
          archived.onsuccess = () => apply(archived.result, key);
        }
      };
      transaction.oncomplete = () => resolve(current);
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not save the test on this device."));
    });
  } finally {
    db.close();
  }
}

type ExportLandmark = { detected: [number, number] | null; used: [number, number] | null };
type ViewDiagnostics = {
  bounding_box?: [number, number, number, number];
  model_score?: number;
  model_score_semantics?: string;
  segments?: Record<string, [[number, number], [number, number]]>;
  landmarks?: Record<string, ExportLandmark>;
};
type ExportReview = {
  diagnostics?: Record<"top" | "side", ViewDiagnostics>;
  provenance?: { source?: string; landmarks?: Record<"top" | "side", Record<string, ExportLandmark>> };
};
const reviewPoints = {
  top: ["left-ear-base", "right-ear-base", "tail-base", "left-chest", "right-chest"],
  side: ["withers", "sternum"],
};

async function annotatedPhoto(photo: File, points: Record<string, ExportLandmark>,
  names: string[], coordinate: keyof ExportLandmark, diagnostics?: ViewDiagnostics): Promise<Blob> {
  const image = await createImageBitmap(photo, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not draw the reviewed photo.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const sx = canvas.width / image.width;
    const sy = canvas.height / image.height;
    if (diagnostics?.bounding_box) {
      const [left, top, right, bottom] = diagnostics.bounding_box;
      ctx.strokeStyle = "#55e6a5";
      ctx.lineWidth = 2;
      ctx.strokeRect(left * sx, top * sy, (right - left) * sx, (bottom - top) * sy);
    }
    if (coordinate === "used") {
      ctx.strokeStyle = "#57c8ff";
      ctx.lineWidth = 3;
      for (const [start, end] of Object.values(diagnostics?.segments ?? {})) {
        ctx.beginPath();
        ctx.moveTo(start[0] * sx, start[1] * sy);
        ctx.lineTo(end[0] * sx, end[1] * sy);
        ctx.stroke();
      }
    }
    ctx.font = "bold 16px sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#111";
    for (const name of names) {
      const point = points[name]?.[coordinate];
      if (!point) continue;
      const x = point[0] * canvas.width / image.width;
      const y = point[1] * canvas.height / image.height;
      ctx.beginPath();
      ctx.arc(x, y, 6, 0, Math.PI * 2);
      ctx.fillStyle = coordinate === "detected" ? "#ffd166" : "#55e6a5";
      ctx.fill();
      ctx.stroke();
      const labelX = Math.max(0, Math.min(x + 9, canvas.width - ctx.measureText(name).width - 3));
      const labelY = Math.max(17, y - 8);
      ctx.strokeText(name, labelX, labelY);
      ctx.fillText(name, labelX, labelY);
    }
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the reviewed photo."));
    }, "image/jpeg", 0.87));
  } finally {
    image.close();
  }
}

function expectedValuation(weight: string, price: string): string | null {
  if (!/^\d+\.\d{2}$/.test(weight) || !/^\d+\.\d{2}$/.test(price)) return null;
  const product = BigInt(weight.replace(".", "")) * BigInt(price.replace(".", ""));
  const cents = ((product + BigInt(50)) / BigInt(100)).toString().padStart(3, "0");
  return cents.slice(0, -2) + "." + cents.slice(-2);
}

function repeatStatistics(values: number[]) {
  if (!values.length) return { count: 0, mean: null, sampleSd: null };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredError = values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  return {
    count: values.length,
    mean,
    sampleSd: values.length > 1 ? Math.sqrt(squaredError / (values.length - 1)) : null,
  };
}

export async function exportRepeatTest(session: RepeatSession): Promise<Blob> {
  const zip = new ZipWriter(new BlobWriter("application/zip"), { useWebWorkers: false, level: 0 });
  const csvCell = (value: unknown) => {
    const raw = String(value ?? "");
    const safe = /^[=+@\-\t\r\n]/.test(raw) ? "'" + raw : raw;
    return '"' + safe.replaceAll('"', '""') + '"';
  };
  const rows = [["pig_id", "attempt", "saved_at", "scale_kg", "estimate_kg", "body_length_cm", "chest_width_cm",
    "chest_depth_cm", "girth_cm", "top_detection_score", "side_detection_score", "formula", "model_bundle", "status", "failure",
    "price_php_per_kg", "price_id", "price_source", "displayed_value_php", "expected_value_php", "valuation_check"]];
  const weights: number[] = [];
  const valuesByPrice = new Map<string, number[]>();;
  for (const attempt of session.attempts) {
    const folder = "A" + String(attempt.number).padStart(2, "0");
    const photos: Record<string, string> = {};
    const detail = attempt.result as (Estimate & ExportReview) | null;
    for (const view of ["top", "side"] as const) {
      const photo = attempt[view];
      if (!photo) continue;
      const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      photos[view] = view + "." + ext;
      await zip.add(folder + "/" + photos[view], new BlobReader(photo));
      const review = detail?.provenance;
      const diagnostics = detail?.diagnostics?.[view];
      const points = diagnostics?.landmarks ?? review?.landmarks?.[view];
      if (points) {
        const manual = review?.source === "manually_adjusted";
        const coordinates: (keyof ExportLandmark)[] = manual ? ["detected", "used"] : ["used"];
        for (const coordinate of coordinates) {
          const label = manual ? (coordinate === "detected" ? "before" : "after") : "overlay";
          const annotated = await annotatedPhoto(photo, points, reviewPoints[view], coordinate, diagnostics);
          await zip.add(`${folder}/${view}-${label}.jpg`, new BlobReader(annotated));
        }
      }
    }
    const { number, savedAt, result, failure } = attempt;
    await zip.add(folder + "/attempt.json", new TextReader(JSON.stringify({
      pig: session.pig, scaleKg: session.scaleKg, number, savedAt, photos, result, failure,
    }, null, 2)));
    if (result) {
      await zip.add(folder + "/yolo-and-measurements.json", new TextReader(JSON.stringify({
        modelBundle: result.artifacts.bundle_id,
        segmentation: { status: "unavailable", reason: "The YOLO pose model returns boxes and landmarks without a pixel mask." },
        diagnostics: detail?.diagnostics ?? null,
        provenance: detail?.provenance ?? null,
        measurements: result.measurements,
        weightKg: result.estimated_weight_kg,
        method: result.method,
      }, null, 2)));
    }
    const m = result?.measurements;
    const valuation = result?.valuation;
    const price = valuation?.price;
    const expected = result && price ? expectedValuation(result.estimated_weight_kg, price.php_per_kg) : null;
    const check = !result ? "" : expected === null ? "unavailable"
      : expected === valuation?.amount_php ? "match" : "mismatch";
    if (result) weights.push(Number(result.estimated_weight_kg));
    if (valuation) {
      const rate = valuation.price.php_per_kg;
      const values = valuesByPrice.get(rate) ?? [];
      values.push(Number(valuation.amount_php));
      valuesByPrice.set(rate, values);
    }
    rows.push([session.pig, String(number), savedAt, session.scaleKg, result?.estimated_weight_kg ?? "",
      m?.body_length_cm ?? "", m?.chest_width_cm ?? "", m?.chest_depth_cm ?? "", m?.girth_cm ?? "",
      String(detail?.diagnostics?.top?.model_score ?? ""), String(detail?.diagnostics?.side?.model_score ?? ""),
      result?.method.formula ?? "", result?.artifacts.bundle_id ?? "", result ? "estimated" : "failed", failure ?? "",
      price?.php_per_kg ?? "", price?.id ?? "", price?.source_reference ?? "",
      valuation?.amount_php ?? "", expected ?? "", check]);
  }
  await zip.add("summary.csv", new TextReader(rows.map((row) => row.map(csvCell).join(",")).join("\r\n")));
  const savedAttempts = session.attempts.length;
  await zip.add("evaluation.json", new TextReader(JSON.stringify({
    pig: session.pig,
    scaleKg: session.scaleKg,
    savedAttempts,
    successfulEstimates: weights.length,
    failedSavedAttempts: savedAttempts - weights.length,
    savedAttemptSuccessRate: savedAttempts ? weights.length / savedAttempts : null,
    weightKg: repeatStatistics(weights),
    displayedValuePhpByFixedRate: Array.from(valuesByPrice, ([pricePhpPerKg, values]) => ({
      pricePhpPerKg,
      ...repeatStatistics(values),
    })),
  }, null, 2)));
  const batchRows = [["pair", "top_photo", "side_photo", "saved_attempt"]];
  const batch = session.batch;
  if (batch) {
    for (let i = 0; i < Math.max(batch.top.length, batch.side.length); i++) {
      const top = batch.top[i], side = batch.side[i];
      const attempt = session.attempts.find((item) => top && side && item.hashes?.top === top.hash && item.hashes?.side === side.hash);
      const paths: string[] = [];
      for (const [view, photo] of [["top", top], ["side", side]] as const) {
        if (!photo) { paths.push(""); continue; }
        const ext = photo.file.type === "image/png" ? "png" : photo.file.type === "image/webp" ? "webp" : "jpg";
        const path = `batch/${i + 1}/${view}.${ext}`;
        await zip.add(path, new BlobReader(photo.file));
        paths.push(path);
      }
      batchRows.push([String(i + 1), ...paths, attempt ? String(attempt.number) : ""]);
    }
    if (batchRows.length > 1) await zip.add("batch.csv", new TextReader(batchRows.map((row) => row.map(csvCell).join(",")).join("\r\n")));
  }
  return zip.close();
}

export async function downloadRepeatTest(session: RepeatSession, suffix: string): Promise<void> {
  const url = URL.createObjectURL(await exportRepeatTest(session));
  const link = document.createElement("a");
  link.href = url;
  const pig = session.pig.replace(/[^a-zA-Z0-9_-]/g, "-") || "pig";
  link.download = `pigweigh-${pig}-${suffix}.zip`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export async function photoDigest(file: File): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}


export async function draftPhoto(view: "top" | "side", file?: File | null): Promise<File | null> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", file === undefined ? "readonly" : "readwrite");
      const store = transaction.objectStore("session");
      const key = "draft-" + view;
      const request = file === undefined ? store.get(key) : file ? store.put(file, key) : store.delete(key);
      transaction.oncomplete = () => resolve(file === undefined ? request.result ?? null : null);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function openPig(pig: string, scaleKg: string): Promise<RepeatSession> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", "readwrite");
      const store = transaction.objectStore("session");
      const read = store.get("current");
      let selected: RepeatSession;
      read.onsuccess = () => {
        const current: RepeatSession | undefined = read.result;
        const key = "pig:" + pig;
        if (current && current.pig !== pig) store.put(current, "pig:" + current.pig);
        const saved = store.get(key);
        saved.onsuccess = () => {
          const previous = current?.pig === pig ? current : saved.result as RepeatSession | undefined;
          selected = { ...previous, pig, createdAt: previous ? previous.createdAt : new Date().toISOString(), scaleKg: scaleKg || previous?.scaleKg || "", attempts: previous?.attempts ?? [] };
          store.put(selected, "current");
          store.delete(key);
        };
      };
      transaction.oncomplete = () => resolve(selected);
      transaction.onabort = () => reject(transaction.error ?? new Error("Could not open this pig."));
    });
  } finally { db.close(); }
}

export async function listPigs(): Promise<RepeatSession[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", "readonly");
      const request = transaction.objectStore("session").openCursor();
      const pigs: RepeatSession[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        if (cursor.key === "current" || String(cursor.key).startsWith("pig:")) {
          pigs.push(cursor.value as RepeatSession);
        }
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(pigs);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}

export async function removePig(pig: string): Promise<boolean> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction("session", "readwrite");
      const store = transaction.objectStore("session");
      const read = store.get("current");
      let removedCurrent = false;
      read.onsuccess = () => {
        removedCurrent = read.result?.pig === pig;
        store.delete("pig:" + pig);
        if (removedCurrent) {
          store.delete("current");
          store.delete("draft-top");
          store.delete("draft-side");
        }
      };
      transaction.oncomplete = () => resolve(removedCurrent);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally { db.close(); }
}
