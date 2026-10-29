import { ApiError, errorMessage, type PhotoValidation, type PhotoView } from "./api";

export type PhotoCheck =
  | { status: "empty"; file: null }
  | { status: "queued" | "checking"; file: File }
  | { status: "passed"; file: File; data: PhotoValidation }
  | { status: "error"; file: File; kind: "rejected" | "busy" | "unavailable" | "connection" | "service" | "interrupted"; message: string };
export type PhotoChecks = { top: PhotoCheck; side: PhotoCheck; running: boolean };
type CheckPhoto = (view: PhotoView, file: File, signal: AbortSignal) => Promise<PhotoValidation>;
type Job = { view: PhotoView; selection: PhotoCheck & { file: File } };

export function photosReady(checks: PhotoChecks): boolean {
  return !checks.running && checks.top.status === "passed" && checks.side.status === "passed";
}

function failedCheck(file: File, error: unknown): PhotoCheck {
  const kind = error instanceof ApiError
    ? [413, 415, 422].includes(error.status) ? "rejected"
      : error.status === 429 ? "busy" : error.status === 503 ? "unavailable" : "service"
    : "connection";
  return { status: "error", file, kind, message: errorMessage(error) };
}

/** One page, one server check at a time. Selections, never filenames, own results. */
export class PhotoCheckQueue {
  private snapshot: PhotoChecks = { top: { status: "empty", file: null }, side: { status: "empty", file: null }, running: false };
  private listeners = new Set<() => void>();
  private jobs: Job[] = [];
  private active: { controller: AbortController } | null = null;
  private enabled = true;

  constructor(private readonly checkPhoto: CheckPhoto) {}

  getSnapshot = (): PhotoChecks => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  resume(): void {
    this.enabled = true;
    this.publish({ ...this.snapshot });
    this.drain();
  }

  dispose(): void {
    this.enabled = false;
    this.jobs = [];
    this.active?.controller.abort();
    this.active = null;
    // Next may preserve this page's state while its effects are disconnected.
    // Keep selected files, but require an explicit retry when the page returns.
    const interrupt = (check: PhotoCheck): PhotoCheck => check.status === "checking" || check.status === "queued"
      ? { status: "error", file: check.file, kind: "interrupted", message: "The page closed before this check finished. Retry to check this photo." }
      : check;
    this.snapshot = { top: interrupt(this.snapshot.top), side: interrupt(this.snapshot.side), running: false };
  }

  select(view: PhotoView, file: File | null): void {
    if (!this.enabled) return;
    this.jobs = this.jobs.filter((job) => job.view !== view);
    const selection: PhotoCheck = file ? { status: "queued", file } : { status: "empty", file: null };
    this.publish({ ...this.snapshot, [view]: selection });
    if (selection.file) this.jobs.push({ view, selection });
    this.drain();
  }

  retry(view: PhotoView): void {
    const check = this.snapshot[view];
    if (check.status === "error" && check.kind !== "rejected") this.select(view, check.file);
  }

  private publish(snapshot: PhotoChecks): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }

  private drain(): void {
    if (!this.enabled || this.active) return;
    const job = this.jobs.shift();
    if (!job) return;
    if (this.snapshot[job.view] !== job.selection) { this.drain(); return; }
    const selection: PhotoCheck = { status: "checking", file: job.selection.file };
    const active = { controller: new AbortController() };
    this.active = active;
    this.publish({ ...this.snapshot, [job.view]: selection, running: true });
    // Do not abort on replacement: the server may still hold its CPU slot until it finishes.
    void this.run(job.view, selection, active);
  }

  private async run(view: PhotoView, selection: PhotoCheck & { file: File }, active: { controller: AbortController }): Promise<void> {
    let result: PhotoCheck;
    try {
      result = { status: "passed", file: selection.file, data: await this.checkPhoto(view, selection.file, active.controller.signal) };
    } catch (error: unknown) {
      result = failedCheck(selection.file, error);
    }
    if (!this.enabled || this.active !== active) return;
    this.active = null;
    this.publish({ ...this.snapshot, ...(this.snapshot[view] === selection ? { [view]: result } : {}), running: false });
    this.drain();
  }
}
