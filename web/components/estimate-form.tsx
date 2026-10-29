"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ApiError, errorMessage, isEstimate, isPriceSnapshot, isReadiness, request, validatePhoto, type Estimate, type LoadState, type PhotoView, type PriceSnapshot, type Readiness } from "@/lib/api";
import { formatMoney, formatPublishedAt } from "@/lib/format";
import { PhotoCheckQueue, photosReady } from "@/lib/photo-checks";
import { CurrentPrice } from "./current-price";
import { PhotoInput } from "./photo-input";

type Submission = { status: "idle" } | { status: "pending" } | { status: "error"; message: string; kind: "unavailable" | "rejected" | "busy" | "other" } | { status: "success"; data: Estimate };

export function EstimateForm(): React.JSX.Element {
  const [price, setPrice] = useState<LoadState<PriceSnapshot>>({ status: "loading" });
  const [readiness, setReadiness] = useState<LoadState<Readiness>>({ status: "loading" });
  const [photoQueue] = useState(() => new PhotoCheckQueue(validatePhoto));
  const checks = useSyncExternalStore(photoQueue.subscribe, photoQueue.getSnapshot, photoQueue.getSnapshot);
  const top = checks.top.file;
  const side = checks.side.file;
  const [submission, setSubmission] = useState<Submission>({ status: "idle" });
  const submitting = useRef(false);
  const outcome = useRef<HTMLDivElement>(null);

  useEffect(() => {
    photoQueue.resume();
    return () => photoQueue.dispose();
  }, [photoQueue]);

  function selectPhoto(view: PhotoView, file: File | null): void {
    if (submitting.current) return;
    photoQueue.select(view, file);
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
    if (!photosReady(current) || !current.top.file || !current.side.file || submitting.current || readiness.status === "loading") return;
    submitting.current = true;
    setSubmission({ status: "pending" });
    const body = new FormData();
    body.set("top_image", current.top.file);
    body.set("side_image", current.side.file);
    try {
      const data = await request("/estimates", isEstimate, { method: "POST", body });
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

  const pending = submission.status === "pending";
  const unavailable = readiness.status === "ready" && !readiness.data.ready;

  return (
    <div className="flow-stack">
      <CurrentPrice state={price} onRetry={() => void refreshPrice()} />
      <form onSubmit={(event) => void submit(event)}>
        <div className="section-heading">
          <h2>Your photo pair</h2>
          <p className="muted">Use the same pig for both views. Use ArUco DICT_4X4_50, ID 0, on a rigid, flat card. The printed black square must measure 100 mm per side, excluding the white margin.</p>
          <p className="muted">Keep the whole marker and white margin visible without covering body landmarks. Review each photo before submitting.</p>
          <p className="muted">Each photo you select or capture is sent automatically for pig and marker checks and is not retained. Camera video stays on your device; only a captured photo is sent.</p>
        </div>
        <div className="photo-grid">
          <PhotoInput view="top" file={top} check={checks.top} disabled={pending} onChange={(file) => selectPhoto("top", file)} onRetry={() => retryPhoto("top")} />
          <PhotoInput view="side" file={side} check={checks.side} disabled={pending} onChange={(file) => selectPhoto("side", file)} onRetry={() => retryPhoto("side")} />
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
          <button className="button button-primary" type="submit" disabled={!photosReady(checks) || pending || readiness.status === "loading"}>
            {pending ? "Submitting photos…" : "Request estimate"}
          </button>
        </div>
      </form>
      <div ref={outcome} tabIndex={-1} className="outcome-region" aria-live="polite" aria-atomic="true" aria-busy={pending}>
        {pending && <div className="notice"><h2>Submitting your photo pair</h2><p>Keep this page open while your request is checked.</p></div>}
        {submission.status === "error" && <div className="notice notice-error"><h2>{submission.kind === "unavailable" ? "No estimate is available" : submission.kind === "rejected" ? "Your photo pair needs review" : submission.kind === "busy" ? "Estimation is busy" : "Your request couldn’t be completed"}</h2><p>{submission.message}</p><p className="muted">{submission.kind === "unavailable" ? "No weight or valuation was calculated. Your photos remain here for review." : submission.kind === "busy" ? "Your selected photos are still here. Wait a moment, then request the estimate again." : "Your selected photos are still here. Review them or try again."}</p></div>}
        {submission.status === "success" && <section className="result-panel" aria-labelledby="result-title">
          <h2 id="result-title">Your experimental estimate</h2>
          <p className="field-help">Calculated from the photo pair using the 11900 formula. Accuracy against scale weights has not been evaluated.</p>
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
            <p>Weight (kg) = girth (cm)² × body length (cm) ÷ 11900.</p>
            <p>Girth approximates an ellipse using chest width and depth. Body length runs from the midpoint of the ear bases to the tail base in the top view. These photo-derived measurements are approximations.</p>
          </details>
        </section>}
      </div>
    </div>
  );
}
