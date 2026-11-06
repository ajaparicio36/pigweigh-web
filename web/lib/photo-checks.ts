import { ApiError, errorMessage, type PhotoValidation, type PhotoView } from "./api";

export type PhotoCheck =
  | { status: "empty"; file: null }
  | { status: "queued" | "checking"; file: File }
  | { status: "passed"; file: File; data: PhotoValidation }
  | { status: "error"; file: File; kind: "rejected" | "busy" | "unavailable" | "connection" | "service" | "interrupted"; message: string };
export type PhotoChecks = { top: PhotoCheck; side: PhotoCheck; running: boolean };
export type CandidatePassed = Readonly<{ status: "passed"; view: PhotoView; file: File; data: PhotoValidation }>;
export type CandidateResult = CandidatePassed | { status: "failed"; kind: "rejected" | "busy" | "unavailable" | "connection" | "service"; message: string } | { status: "cancelled" };
type CheckPhoto = (view: PhotoView, file: File, signal: AbortSignal) => Promise<PhotoValidation>;
type SelectionJob = { kind: "selection"; view: PhotoView; selection: PhotoCheck & { file: File } };
type CandidateJob = { kind: "candidate"; view: PhotoView; file: File; revision: number; signal: AbortSignal;
  cancelled: boolean; settled: boolean; resolve: (result: CandidateResult) => void; onAbort: () => void };
type Job = SelectionJob | CandidateJob;
type Active = { job: Job; controller: AbortController };
type Proof = { result: CandidatePassed; view: PhotoView; file: File; data: PhotoValidation; revision: number; signal: AbortSignal; onAbort: () => void };

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
function candidateFailure(error: unknown): Extract<CandidateResult, { status: "failed" }> {
  const kind = error instanceof ApiError
    ? error.status === 422 ? "rejected" : error.status === 429 ? "busy" : error.status === 503 ? "unavailable" : "service"
    : "connection";
  return { status: "failed", kind, message: errorMessage(error) };
}

/** One page, one server check at a time. Selections, never filenames, own results. */
export class PhotoCheckQueue {
  private snapshot: PhotoChecks = { top: { status: "empty", file: null }, side: { status: "empty", file: null }, running: false };
  private listeners = new Set<() => void>();
  private jobs: Job[] = [];
  private active: Active | null = null;
  private enabled = true;
  private revision = { top: 0, side: 0 };
  private proof: Proof | null = null;

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
    this.clearProof();
    for (const job of this.jobs) if (job.kind === "candidate") this.cancelCandidate(job);
    this.jobs = [];
    // Keep an in-flight request in the lane: aborting fetch would not prove the
    // server CPU has stopped. Its eventual result is ignored after disposal.
    if (this.active?.job.kind === "candidate") this.cancelCandidate(this.active.job);
    const interrupt = (check: PhotoCheck): PhotoCheck => check.status === "checking" || check.status === "queued"
      ? { status: "error", file: check.file, kind: "interrupted", message: "The page closed before this check finished. Retry to check this photo." }
      : check;
    this.snapshot = { top: interrupt(this.snapshot.top), side: interrupt(this.snapshot.side), running: this.active !== null };
  }
  select(view: PhotoView, file: File | null): void {
    if (!this.enabled) return;
    this.revision[view]++;
    if (this.proof?.result.view === view) this.clearProof();
    for (const job of this.jobs) if (job.view === view && job.kind === "candidate") this.cancelCandidate(job);
    this.jobs = this.jobs.filter((job) => job.view !== view);
    const selection: PhotoCheck = file ? { status: "queued", file } : { status: "empty", file: null };
    this.publish({ ...this.snapshot, [view]: selection });
    if (selection.file) this.jobs.push({ kind: "selection", view, selection });
    this.drain();
  }
  retry(view: PhotoView): void {
    const check = this.snapshot[view];
    if (check.status === "error" && check.kind !== "rejected") this.select(view, check.file);
  }
  checkCandidate(view: PhotoView, file: File, signal: AbortSignal): Promise<CandidateResult> {
    if (!this.enabled || signal.aborted) return Promise.resolve({ status: "cancelled" });
    if (this.active?.job.kind === "candidate" || this.jobs.some((job) => job.kind === "candidate")) {
      return Promise.resolve({ status: "failed", kind: "busy", message: "A guided photo check is still finishing." });
    }
    this.clearProof();
    return new Promise((resolve) => {
      const job: CandidateJob = { kind: "candidate", view, file, revision: this.revision[view], signal,
        cancelled: false, settled: false, resolve, onAbort: () => this.cancelCandidate(job) };
      signal.addEventListener("abort", job.onAbort, { once: true });
      this.jobs.push(job);
      this.drain();
    });
  }
  /** Promotes only this queue's current successful result for this exact File and view. */
  promoteCandidate(result: CandidatePassed): boolean {
    const proof = this.proof;
    if (!this.enabled || !proof || proof.result !== result || proof.signal.aborted
      || result.view !== proof.view || result.file !== proof.file || result.data !== proof.data || this.revision[proof.view] !== proof.revision) return false;
    this.clearProof();
    this.revision[proof.view]++;
    this.jobs = this.jobs.filter((job) => job.view !== proof.view || job.kind !== "selection");
    this.publish({ ...this.snapshot, [proof.view]: { status: "passed", file: proof.file, data: proof.data } });
    return true;
  }
  private clearProof(): void {
    if (this.proof) this.proof.signal.removeEventListener("abort", this.proof.onAbort);
    this.proof = null;
  }
  private cancelCandidate(job: CandidateJob): void {
    job.cancelled = true;
    if (this.proof?.onAbort === job.onAbort) this.clearProof();
    if (!job.settled) { job.settled = true; job.resolve({ status: "cancelled" }); }
    job.signal.removeEventListener("abort", job.onAbort);
    this.jobs = this.jobs.filter((queued) => queued !== job);
  }
  private publish(snapshot: PhotoChecks): void {
    this.snapshot = snapshot;
    this.listeners.forEach((listener) => listener());
  }
  private drain(): void {
    if (!this.enabled || this.active) return;
    const job = this.jobs.shift();
    if (!job) return;
    if (job.kind === "candidate" && (job.cancelled || job.signal.aborted || job.revision !== this.revision[job.view])) {
      this.cancelCandidate(job); this.drain(); return;
    }
    if (job.kind === "selection" && this.snapshot[job.view] !== job.selection) { this.drain(); return; }
    const active: Active = { job, controller: new AbortController() };
    this.active = active;
    if (job.kind === "selection") {
      const selection: PhotoCheck = { status: "checking", file: job.selection.file };
      this.publish({ ...this.snapshot, [job.view]: selection, running: true });
      void this.runSelection(job.view, selection, active);
    } else {
      this.publish({ ...this.snapshot, running: true });
      void this.runCandidate(job, active);
    }
  }
  private async runSelection(view: PhotoView, selection: PhotoCheck & { file: File }, active: Active): Promise<void> {
    let result: PhotoCheck;
    try { result = { status: "passed", file: selection.file, data: await this.checkPhoto(view, selection.file, active.controller.signal) }; }
    catch (error: unknown) { result = failedCheck(selection.file, error); }
    if (this.active !== active) return;
    this.active = null;
    if (!this.enabled) { this.snapshot = { ...this.snapshot, running: false }; return; }
    this.publish({ ...this.snapshot, ...(this.snapshot[view] === selection ? { [view]: result } : {}), running: false });
    this.drain();
  }
  private async runCandidate(job: CandidateJob, active: Active): Promise<void> {
    let result: CandidateResult;
    try {
      const data = await this.checkPhoto(job.view, job.file, active.controller.signal);
      if (data.status !== "validated" || data.view !== job.view) throw new ApiError(200, "invalid_response", "The photo check returned an unexpected result.");
      result = Object.freeze({ status: "passed", view: job.view, file: job.file, data });
    } catch (error: unknown) { result = candidateFailure(error); }
    if (this.active !== active) return;
    this.active = null;
    const valid = this.enabled && !job.cancelled && !job.signal.aborted && job.revision === this.revision[job.view];
    if (valid && result.status === "passed") {
      this.proof = { result, view: job.view, file: job.file, data: result.data, revision: job.revision, signal: job.signal, onAbort: job.onAbort };
    } else {
      job.signal.removeEventListener("abort", job.onAbort);
    }
    if (!job.settled) { job.settled = true; job.resolve(valid ? result : { status: "cancelled" }); }
    if (this.enabled) { this.publish({ ...this.snapshot, running: false }); this.drain(); }
    else this.snapshot = { ...this.snapshot, running: false };
  }
}
