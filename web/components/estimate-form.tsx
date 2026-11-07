"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { attachPhoto, ApiError, errorMessage, isEstimate, isPriceSnapshot, isReadiness, request, validatePhoto, type Estimate, type LoadState, type PhotoView, type PriceSnapshot, type Readiness } from "@/lib/api";
import { formatMoney, formatPublishedAt } from "@/lib/format";
import { PhotoCheckQueue, photosReady } from "@/lib/photo-checks";
import { KeypointReview, type Adjustments } from "./keypoint-review";
import { draftPhoto } from "@/lib/repeat-test";
import { RepeatTest } from "./repeat-test";
import { CurrentPrice } from "./current-price";
import { PhotoInput, type GuidedCaptureBinding } from "./photo-input";

type Submission = { status: "idle" } | { status: "pending" } | { status: "error"; message: string; kind: "unavailable" | "rejected" | "busy" | "other" } | { status: "success"; data: Estimate };

export function EstimateForm(): React.JSX.Element {
  const [price, setPrice] = useState<LoadState<PriceSnapshot>>({ status: "loading" });
  const [readiness, setReadiness] = useState<LoadState<Readiness>>({ status: "loading" });
  const [photoQueue] = useState(() => new PhotoCheckQueue(validatePhoto));
  const checks = useSyncExternalStore(photoQueue.subscribe, photoQueue.getSnapshot, photoQueue.getSnapshot);
  const top = checks.top.file;
  const side = checks.side.file;
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  const [showReview, setReview] = useState(true);
  const review = showReview && photosReady(checks);
  const [adjustments, setAdjustments] = useState<Adjustments | null>(null);
  const draftTouched = useRef({ top: false, side: false });
  const [draftError, setDraftError] = useState(false);
  const submitting = useRef(false);
  const outcome = useRef<HTMLDivElement>(null);

  useEffect(() => {
    photoQueue.resume();
    let active = true;
    for (const view of ["top", "side"] as const) {
      void draftPhoto(view).then((file) => {
        if (active && file && !draftTouched.current[view]) photoQueue.select(view, file);
      }).catch(() => { if (active) setDraftError(true); });
    }
    return () => { active = false; photoQueue.dispose(); };
  }, [photoQueue]);

  function selectPhoto(view: PhotoView, file: File | null): void {
    if (submitting.current) return;
    setReview(true);
    setAdjustments(null);
    draftTouched.current[view] = true;
    photoQueue.select(view, file);
    void draftPhoto(view, file).catch(() => setDraftError(true));
    setSubmission({ status: "idle" });
  }

  function retryPhoto(view: PhotoView): void {
    if (!submitting.current) photoQueue.retry(view);
  }

  useEffect(() => {
    const controller = new AbortController();
    request("/prices/current", isPriceSnapshot, { signal: controller.signal }).then(
      (data) => setPrice({ status: "ready", data }),
      (error: unknown) => { if (!controller.signal.aborted) setPrice({ status: "error", message: errorMessage(error) }); },
    );
    request("/inference/readiness", isReadiness, { signal: controller.signal }).then(
      (data) => setReadiness({ status: "ready", data }),
      (error: unknown) => { if (!controller.signal.aborted) setReadiness({ status: "error", message: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, []);

  async function refreshPrice(): Promise<void> {
    setPrice({ status: "loading" });
    try { setPrice({ status: "ready", data: await request("/prices/current", isPriceSnapshot) }); }
    catch (error: unknown) { setPrice({ status: "error", message: errorMessage(error) }); }
  }

  async function refreshReadiness(): Promise<void> {
    setReadiness({ status: "loading" });
    try { setReadiness({ status: "ready", data: await request("/inference/readiness", isReadiness) }); }
    catch (error: unknown) { setReadiness({ status: "error", message: errorMessage(error) }); }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const current = photoQueue.getSnapshot();
    if (review || !photosReady(current) || !current.top.file || !current.side.file || submitting.current || readiness.status === "loading") return;
    submitting.current = true;
    setSubmission({ status: "pending" });
    const body = new FormData();
    attachPhoto(body, "top_image", current.top.file);
    attachPhoto(body, "side_image", current.side.file);
    if (adjustments) body.set("adjustments", JSON.stringify(adjustments));
    try {
      const data = await request("/estimates?diagnostics=true", isEstimate, { method: "POST", body });
      setSubmission({ status: "success", data });
    } catch (error: unknown) {
      const kind = error instanceof ApiError
        ? error.status === 503 ? "unavailable" : error.status === 422 ? "rejected" : error.status === 429 ? "busy" : "other"
        : "other";
      setSubmission({ status: "error", message: errorMessage(error), kind });
    } finally {
      submitting.current = false;
      outcome.current?.focus();
    }
  }

  const guidedCapture: GuidedCaptureBinding = {
    checkCandidate: (view, file, signal) => photoQueue.checkCandidate(view, file, signal),
    onAccept: (candidate) => {
      if (submitting.current || !photoQueue.promoteCandidate(candidate)) return false;
      draftTouched.current[candidate.view] = true;
      void draftPhoto(candidate.view, candidate.file).catch(() => setDraftError(true));
      setReview(true);
      setAdjustments(null);
      setSubmission({ status: "idle" });
      return true;
    },
  };

  const pending = submission.status === "pending";
  const unavailable = readiness.status === "ready" && !readiness.data.ready;

  return (
    <div className="flow-stack">
      <CurrentPrice state={price} onRetry={() => void refreshPrice()} />
      <RepeatTest checkCandidate={guidedCapture.checkCandidate} onLoadPair={(topFile, sideFile) => {
        selectPhoto("top", topFile); selectPhoto("side", sideFile);
        document.getElementById("manual-keypoints")?.scrollIntoView({ block: "start" });
      }} top={top} side={side} canEstimate={!review && photosReady(checks) && readiness.status !== "loading"} disabled={pending || checks.running}
        result={submission.status === "success" ? submission.data : null}
        failure={submission.status === "error" ? submission.message
          : checks.top.status === "error" ? checks.top.message
          : checks.side.status === "error" ? checks.side.message : null}
        onNext={() => {
          const current = photoQueue.getSnapshot();
          if (current.top.file !== top || current.side.file !== side) return;
          selectPhoto("top", null); selectPhoto("side", null);
        }} />
      {draftError && <p role="status">This browser could not save or restore the photo draft.</p>}
      <form id="pig-estimate-form" onSubmit={(event) => void submit(event)}>
        <div className="section-heading">
          <h2>Your photo pair</h2>
          <p className="muted">Use the same pig for both views. Use ArUco DICT_4X4_50, ID 0, on a rigid, flat card. The printed black square must measure 100 mm per side, excluding the white margin.</p>
          <p className="muted">Keep the whole marker and white margin visible without covering body landmarks. Review each photo before submitting.</p>
          <p className="muted">Each photo you select or capture is sent automatically for pig and marker checks and is not retained. Camera video stays on your device; only a captured photo is sent.</p>
        </div>
        <div className="photo-grid">
          <PhotoInput guidedCapture={guidedCapture} view="top" file={top} check={checks.top} disabled={pending} onChange={(file) => selectPhoto("top", file)} onRetry={() => retryPhoto("top")} />
          <PhotoInput guidedCapture={guidedCapture} view="side" file={side} check={checks.side} disabled={pending} onChange={(file) => selectPhoto("side", file)} onRetry={() => retryPhoto("side")} />
        </div>
        <div className="capture-note"><p>Both views must show the same animal; PigWeigh does not verify its identity. Passing photo checks does not verify the printed marker’s size or weight accuracy. Both photos are checked again when you request an estimate.</p></div>
        <section className="readiness-panel" aria-labelledby="readiness-title" aria-busy={readiness.status === "loading"}>
          <div className="readiness-heading">
            <h2 id="readiness-title">{unavailable ? "Weight estimation is unavailable" : "Estimation availability"}</h2>
            <button type="button" className="text-button" disabled={readiness.status === "loading" || pending} onClick={() => void refreshReadiness()}>Check again</button>
          </div>
          {readiness.status === "loading" && <p role="status" className="muted">Checking availability…</p>}
          {readiness.status === "error" && <p className="field-error" role="alert">{readiness.message} Availability could not be confirmed.</p>}
          {unavailable && <>
            <p>The estimation service is not ready. Submitting photos now will not produce a weight or valuation.</p>
            {readiness.data.blockers.length > 0 && <details><summary>Why estimation is unavailable</summary><ul>{readiness.data.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}</ul></details>}
          </>}
          {readiness.status === "ready" && readiness.data.ready && <p>Experimental estimation is available. Your photos still need to pass capture validation.</p>}
        </section>
        <div className="submit-row">
          <div>
            <p className="submit-status">{!top && !side ? "Add both photos to continue." : !top ? "Add the top-view photo to continue." : !side ? "Add the side-view photo to continue." : checks.running ? "Checking your photos before estimation…" : photosReady(checks) ? "Both photos passed checks. Ready to submit." : "Both photos must pass checks before estimation."}</p>
            <p className="field-help">Two views, one pig. No account needed.</p>
          </div>
          <button className="button button-secondary" type="button" disabled={!photosReady(checks) || pending || review}
            onClick={() => { setReview(true); document.getElementById("manual-keypoints")?.scrollIntoView({ block: "start" }); }}>Review keypoints</button>
          {adjustments && <span role="status">Reviewed points ready</span>}
          <button className="button button-primary" type="submit" disabled={review || !photosReady(checks) || pending || readiness.status === "loading"}>
            {pending ? "Submitting photos…" : "Request estimate"}
          </button>
        </div>
      </form>
      <div id="manual-keypoints">
        {top && side && !photosReady(checks) && <section className="result-panel">
          <h2>Manual keypoints</h2>
          <p>{checks.running ? "Checking both photos before loading the editor…" : "Both photos must pass validation to edit keypoints. See the photo checks above."}</p>
        </section>}
      {review && top && side && <KeypointReview top={top} side={side} initial={adjustments?.overrides} onClose={() => setReview(false)}
        onApply={(points) => { setAdjustments(points); setSubmission({ status: "idle" }); setReview(false); }} />}
      </div>
      <div ref={outcome} tabIndex={-1} className="outcome-region" aria-live="polite" aria-atomic="true" aria-busy={pending}>
        {pending && <div className="notice"><h2>Submitting your photo pair</h2><p>Keep this page open while your request is checked.</p></div>}
        {submission.status === "error" && <div className="notice notice-error"><h2>{submission.kind === "unavailable" ? "No estimate is available" : submission.kind === "rejected" ? "Your photo pair needs review" : submission.kind === "busy" ? "Estimation is busy" : "Your request couldn’t be completed"}</h2><p>{submission.message}</p><p className="muted">{submission.kind === "unavailable" ? "No weight or valuation was calculated. Your photos remain here for review." : submission.kind === "busy" ? "Your selected photos are still here. Wait a moment, then request the estimate again." : "Your selected photos are still here. Review them or try again."}</p></div>}
        {submission.status === "success" && <section className="result-panel" aria-labelledby="result-title">
          <h2 id="result-title">Your experimental estimate</h2>
          <p className="field-help">Calculated from the photo pair using the 14451 formula. Accuracy against scale weights has not been evaluated.</p>
          <div className="result-grid"><div><p className="field-caption">Estimated live weight</p><p className="result-value">{submission.data.estimated_weight_kg} <span>kg</span></p></div>
            <div><p className="field-caption">Estimated valuation</p><p className="result-value">{submission.data.valuation ? formatMoney(submission.data.valuation.amount_php) : "Unavailable"}</p></div></div>
          {submission.data.valuation ? <div className="result-source"><p>Calculated using {formatMoney(submission.data.valuation.price.php_per_kg)} per kg.</p><p><span className="field-caption">Source reference</span>{submission.data.valuation.price.source_reference}</p><p className="muted">Published {formatPublishedAt(submission.data.valuation.price.published_at)} (Philippine time). This price is the one used for this estimate.</p></div> : <p className="muted">There was no published price when this estimate was calculated. The estimated live weight is still shown above.</p>}
          <details className="measurement-details">
            <summary>Measurements and formula</summary>
            <dl className="measurement-list">
              <div><dt>Body length, top view</dt><dd>{submission.data.measurements.body_length_cm} cm</dd></div>
              <div><dt>Chest width, top view</dt><dd>{submission.data.measurements.chest_width_cm} cm</dd></div>
              <div><dt>Chest depth, side view</dt><dd>{submission.data.measurements.chest_depth_cm} cm</dd></div>
              <div><dt>Girth, ellipse estimate</dt><dd>{submission.data.measurements.girth_cm} cm</dd></div>
            </dl>
            <p>Weight (kg) = girth (cm)² × body length (cm) ÷ 14451.</p>
            <p>Girth approximates an ellipse using chest width and depth. Body length runs from the midpoint of the ear bases to the tail base in the top view. These photo-derived measurements are approximations.</p>
          </details>
        </section>}
      </div>

    </div>
  );
}
