import type { CandidatePassed, CandidateResult } from "./photo-checks";
import type { PhotoView } from "./api";

export const GUIDED_MAX_ATTEMPTS = 5;
export const GUIDED_MAX_DURATION_MS = 30_000;
export const GUIDED_RETAKE_DELAY_MS = 1_200;
export const GUIDED_BUSY_BASE_MS = 1_000;
export const GUIDED_BUSY_MAX_MS = 4_000;
export type GuidedProgress = { attempt: number; message: string };
export type GuidedResult = { status: "passed"; candidate: CandidatePassed } | { status: "stopped" | "expired" | "exhausted" } | { status: "failed"; message: string };
type GuidedOptions = {
  view: PhotoView;
  signal: AbortSignal;
  capture: () => Promise<File>;
  check: (file: File, signal: AbortSignal) => Promise<CandidateResult>;
  onProgress?: (progress: GuidedProgress) => void;
  now?: () => number;
  wait?: (milliseconds: number, signal: AbortSignal) => Promise<void>;
};
const STOP = Symbol("guided capture stopped");
function abortable<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { void work.catch(() => undefined); reject(STOP); return; }
    const onAbort = (): void => reject(STOP);
    signal.addEventListener("abort", onAbort, { once: true });
    work.then((result) => { signal.removeEventListener("abort", onAbort); resolve(result); },
      (error: unknown) => { signal.removeEventListener("abort", onAbort); reject(error); });
  });
}
function defaultWait(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, milliseconds);
    const onAbort = (): void => { clearTimeout(timer); resolve(); };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
/** The camera stays local; each check sends one still and shares the selected-photo queue. */
export async function runGuidedCapture(options: GuidedOptions): Promise<GuidedResult> {
  if (options.signal.aborted) return { status: "stopped" };
  const controller = new AbortController();
  const relay = (): void => controller.abort();
  options.signal.addEventListener("abort", relay, { once: true });
  const now = options.now ?? Date.now;
  const wait = options.wait ?? defaultWait;
  const deadline = now() + GUIDED_MAX_DURATION_MS;
  let expired = false;
  const timer = setTimeout(() => { expired = true; controller.abort(); }, GUIDED_MAX_DURATION_MS);
  let busyCount = 0;
  let passed = false;
  try {
    for (let attempt = 1; attempt <= GUIDED_MAX_ATTEMPTS; attempt++) {
      if (controller.signal.aborted) return { status: expired ? "expired" : "stopped" };
      if (now() >= deadline) return { status: "expired" };
      options.onProgress?.({ attempt, message: `Checking photo ${attempt} of ${GUIDED_MAX_ATTEMPTS}…` });
      const file = await abortable(options.capture(), controller.signal);
      if (controller.signal.aborted) return { status: expired ? "expired" : "stopped" };
      const result = await abortable(options.check(file, controller.signal), controller.signal);
      if (result.status === "cancelled") return { status: expired ? "expired" : "stopped" };
      if (result.status === "passed") {
        if (result.file !== file || result.view !== options.view) return { status: "failed", message: "The guided check returned an unexpected photo. Try manual capture." };
        passed = true;
        return { status: "passed", candidate: result };
      }
      if (result.kind !== "rejected" && result.kind !== "busy") return { status: "failed", message: result.message };
      if (attempt === GUIDED_MAX_ATTEMPTS) return { status: "exhausted" };
      const delay = result.kind === "busy" ? Math.min(GUIDED_BUSY_BASE_MS * 2 ** busyCount++, GUIDED_BUSY_MAX_MS) : GUIDED_RETAKE_DELAY_MS;
      if (result.kind === "rejected") busyCount = 0;
      options.onProgress?.({ attempt, message: result.kind === "busy" ? "Checks are busy. Waiting before trying another photo…" : "This still did not pass the photo check. Trying another…" });
      const remaining = deadline - now();
      if (remaining <= 0) return { status: "expired" };
      await abortable(wait(Math.min(delay, remaining), controller.signal), controller.signal);
    }
    return { status: "exhausted" };
  } catch (error: unknown) {
    if (error === STOP || controller.signal.aborted) return { status: expired ? "expired" : "stopped" };
    return { status: "failed", message: error instanceof Error ? error.message : "The guided photo could not be saved. Try manual capture." };
  } finally {
    clearTimeout(timer);
    if (!passed) options.signal.removeEventListener("abort", relay);
  }
}
