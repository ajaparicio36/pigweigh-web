import type { CandidatePassed, CandidateResult } from "./photo-checks";
import type { PhotoView } from "./api";

export const GUIDED_RETAKE_DELAY_MS = 500;
export type GuidedProgress = { attempt: number; message: string };
export type GuidedResult = { status: "passed"; candidate: CandidatePassed } | { status: "stopped" } | { status: "failed"; message: string };
type GuidedOptions = {
  view: PhotoView;
  signal: AbortSignal;
  capture: () => Promise<File>;
  check: (file: File, signal: AbortSignal) => Promise<CandidateResult>;
  onProgress?: (progress: GuidedProgress) => void;
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
  const { signal } = options;
  const wait = options.wait ?? defaultWait;
  try {
    for (let attempt = 1; !signal.aborted; attempt++) {
      options.onProgress?.({ attempt, message: `Checking photo ${attempt}…` });
      const file = await abortable(options.capture(), signal);
      if (signal.aborted) return { status: "stopped" };
      const result = await abortable(options.check(file, signal), signal);
      if (result.status === "cancelled") return { status: "stopped" };
      if (result.status === "passed") {
        if (result.file !== file || result.view !== options.view) return { status: "failed", message: "The guided check returned an unexpected photo. Try manual capture." };
        return { status: "passed", candidate: result };
      }
      if (result.kind !== "rejected" && result.kind !== "busy") return { status: "failed", message: result.message };
      options.onProgress?.({ attempt, message: result.message + " Trying another photo…" });
      await abortable(wait(GUIDED_RETAKE_DELAY_MS, signal), signal);
    }
    return { status: "stopped" };
  } catch (error: unknown) {
    if (error === STOP || signal.aborted) return { status: "stopped" };
    return { status: "failed", message: error instanceof Error ? error.message : "The guided photo could not be saved. Try manual capture." };
  }
}
