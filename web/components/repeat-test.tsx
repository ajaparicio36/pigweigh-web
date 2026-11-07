"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { attachPhoto, isEstimate, request, type Estimate } from "@/lib/api";
import type { GuidedCaptureBinding } from "./photo-input";
import { CameraModal } from "./camera-modal";
import { photoValidationError } from "@/lib/camera";
import { KeypointReview, type Adjustments } from "./keypoint-review";
import { editSession, downloadRepeatTest, openPig, photoDigest, type BatchPhoto, type RepeatAttempt, type RepeatSession } from "@/lib/repeat-test";

function AttemptPhotos({ attempt }: { attempt: Pick<RepeatAttempt, "top" | "side"> & { number?: number } }): React.JSX.Element {
  const [urls, setUrls] = useState<{ top: string | null; side: string | null } | null>(null);
  useEffect(() => {
    const top = attempt.top ? URL.createObjectURL(attempt.top) : null;
    const side = attempt.side ? URL.createObjectURL(attempt.side) : null;
    const frame = requestAnimationFrame(() => setUrls({ top, side }));
    return () => {
      cancelAnimationFrame(frame);
      if (top) URL.revokeObjectURL(top);
      if (side) URL.revokeObjectURL(side);
    };
  }, [attempt.top, attempt.side]);
  return <div className="camera-tool-row">
    {(["top", "side"] as const).map((view) => urls?.[view] &&
      <figure key={view} style={{ margin: 0, width: "min(45%, 14rem)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={urls[view]} alt={`${attempt.number === undefined ? "Current photo" : "Attempt " + attempt.number}, ${view} view`} style={{ width: "100%" }} />
        <figcaption>{view === "top" ? "Top view" : "Side view"}</figcaption>
      </figure>)}
  </div>;
}

export function RepeatTest({ top, side, result, failure, disabled, canEstimate, checkCandidate, onLoadPair, onNext }: {
  top: File | null; side: File | null; result: Estimate | null; failure: string | null;
  disabled: boolean; canEstimate: boolean; checkCandidate: GuidedCaptureBinding["checkCandidate"]; onLoadPair: (top: File, side: File) => void; onNext: () => void;
}): React.JSX.Element {
  const [session, setSession] = useState<RepeatSession | null>(null);
  const [pig, setPig] = useState("");
  const [scale, setScale] = useState("");
  const [ready, setReady] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [batchCamera, setBatchCamera] = useState<"top" | "side" | null>(null);
  const closeBatchCamera = useCallback(() => setBatchCamera(null), []);
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    try {
      setPig(localStorage.getItem("pigweigh-draft-pig") ?? "");
      setScale(localStorage.getItem("pigweigh-draft-scale") ?? "");
    } catch { /* The active test is stored separately. */ }
    void editSession().then((current) => {
      if (active) { setSession(current); if (current) { setPig(current.pig); setScale(current.scaleKg); } setReady(true); }
    }).catch(() => { if (active) setMessage("This browser could not open local test storage."); });
    return () => { active = false; };
  }, []);

  function saveField(field: "pig" | "scale", value: string): void {
    if (field === "pig") setPig(value);
    else setScale(value);
    try { localStorage.setItem("pigweigh-draft-" + field, value); }
    catch { setMessage("This browser could not save the test fields as a draft."); }
  }

  async function run(action: () => Promise<void>, allowDuringChecks = false): Promise<void> {
    if (lock.current || (disabled && !allowDuringChecks)) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "The test could not be saved or exported."); }
    finally { lock.current = false; setBusy(false); }
  }

  async function addBatch(view: "top" | "side", files: File[]): Promise<boolean> {
    if (!session || !files.length) return false;
    let saved = false;
    await run(async () => {
      const incoming: BatchPhoto[] = [];
      for (const file of files) {
        const problem = photoValidationError(file);
        if (problem) throw new Error(problem);
        incoming.push({ file, hash: await photoDigest(file) });
      }
      const updated = await editSession((current) => {
        if (!current || current.pig !== session.pig) throw new Error("Open the pig again before adding photos.");
        const batch = current.batch ?? { top: [], side: [] };
        if (batch[view].length + incoming.length > 10) throw new Error("This view can hold up to 10 photos.");
        const hashes = new Set([...batch.top, ...batch.side].map((photo) => photo.hash));
        for (const photo of incoming) {
          if (hashes.has(photo.hash) || current.attempts.some((take) => take.hashes?.top === photo.hash || take.hashes?.side === photo.hash)) {
            throw new Error("One of these photos is already saved for this pig.");
          }
          hashes.add(photo.hash);
        }
        return { ...current, batch: { ...batch, [view]: [...batch[view], ...incoming] } };
      });
      setSession(updated);
      saved = true;
      const total = updated?.batch?.[view].length ?? 0;
      setMessage(`${total}/10 ${view} photos saved.`);
      if (total === 10) closeBatchCamera();
    });
    return saved;
  }

  const nextBatchView = (session?.batch?.top.length ?? 0) < 10 ? "top"
    : (session?.batch?.side.length ?? 0) < 10 ? "side" : null;
  const blocked = !ready || busy || disabled;
  const nextNumber = Math.max(0, ...(session?.attempts.map((attempt) => attempt.number) ?? [])) + 1;
  const count = session?.attempts.length ?? 0;
  const canSave = Boolean(top && side && (result || failure));
  const paired = session?.attempts.filter((attempt) => attempt.top && attempt.side).length ?? 0;
  const estimatedWeights = session?.attempts.flatMap((attempt) =>
    attempt.result ? [Number(attempt.result.estimated_weight_kg)] : []) ?? [];
  const average = estimatedWeights.length
    ? estimatedWeights.reduce((sum, weight) => sum + weight, 0) / estimatedWeights.length
    : null;
  return <section id="pig-test" className="result-panel pig-attempts" aria-label="Pig attempts">
    <h2>Pig attempts</h2>
    <p>Open a pig by ID, then save each fresh top and side pair. Open the same ID later to resume.</p>
    <div className="field">
      <label htmlFor="repeat-pig-id">Pig ID</label>
      <input id="repeat-pig-id" value={pig}
        placeholder="e.g. Pig 1" onChange={(event) => saveField("pig", event.target.value)} maxLength={80} />
    </div>
    <div className="field">
      <label htmlFor="repeat-scale-kg">Scale weight (kg, optional)</label>
      <input id="repeat-scale-kg" value={scale}
        placeholder="e.g. 23.45" onChange={(event) => saveField("scale", event.target.value)} inputMode="decimal" maxLength={12} />
    </div>
    <>
      <button className="button button-secondary" type="button" disabled={busy || disabled}
        onClick={() => void run(async () => {
          const pigId = pig.trim();
          const weight = scale.trim().replace(",", ".");
          if (!pigId) throw new Error("Enter a pig ID, such as Pig 1.");
          if (weight && (!/^\d+(?:\.\d{1,3})?$/.test(weight) || Number(weight) <= 0)) {
            throw new Error("Enter a positive scale weight, such as 23.45. Leave out kg.");
          }
          const opened = await openPig(pigId, weight);
          setSession(opened);
          setScale(opened.scaleKg);
          setViewing(null);
          setEditing(null);
          if (session && session.pig !== opened.pig) onNext();
          setMessage(`Opened ${opened.pig}.`);
          setReady(true);
        })}>Open pig</button>
    </>
    {session && <section className="pilot-section" aria-label="Batch capture">
      <h3>Batch capture · {session.pig}</h3>
      <p role="status">{nextBatchView ? `Next: capture ${nextBatchView} photos.` : "Both batches are full. Review your photo pairs below."}</p>
      <p>Save 10 top photos, then 10 side photos. Take 1 pairs with take 1, and so on.</p>
      {(["top", "side"] as const).map((view) => {
        const count = session.batch?.[view].length ?? 0;
        return <div className="field" key={view}>
          <strong>{view === "top" ? "Top view" : "Side view"} · {count}/10</strong>
          <button type="button" className={`button ${view === nextBatchView ? "button-primary" : "button-secondary"}`} disabled={blocked || count >= 10}
            onClick={() => setBatchCamera(view)}>Capture {view} batch</button>
          <label>Upload {view} photos <input type="file" accept="image/jpeg,image/png,image/webp" multiple
            disabled={blocked || count >= 10} onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void addBatch(view, files);
            }} /></label>
        </div>;
      })}
      {batchCamera && <CameraModal view={batchCamera} disabled={false} keepOpen captureBusy={busy}
        guidedCapture={{ checkCandidate, onAccept: (candidate) => addBatch(batchCamera, [candidate.file]) }}
        batchStatus={message || `${session.batch?.[batchCamera].length ?? 0}/10 saved`}
        onCapture={(file) => { void addBatch(batchCamera, [file]); }} onClose={closeBatchCamera} />}
      {session.batch?.top.map((photo, index) => {
        const sidePhoto = session.batch?.side[index];
        if (!sidePhoto) return null;
        const saved = session.attempts.some((attempt) => attempt.hashes?.top === photo.hash && attempt.hashes?.side === sidePhoto.hash);
        return <button key={photo.hash} type="button" className="button button-secondary"
          disabled={blocked || saved} onClick={() => onLoadPair(photo.file, sidePhoto.file)}>
          {saved ? `Pair ${index + 1} saved` : `Review pair ${index + 1}`}
        </button>;
      })}
    </section>}
    {(session || top || side) && <section className="pilot-section" aria-label="Current photo pair">
      <h3>{session ? `Attempt ${nextNumber} · In progress` : "Current photo pair"}</h3>
      <AttemptPhotos attempt={{ top, side }} />
      <p>Top photo: {top ? "Added" : "Needed"} · Side photo: {side ? "Added" : "Needed"}</p>
      {session && top && side && !result && !failure && <button type="submit" form="pig-estimate-form"
        className="button button-primary" disabled={!canEstimate || disabled}>Request estimate for attempt {nextNumber}</button>}
      {result && top && side && <div className="camera-tool-row"><strong>{result.estimated_weight_kg} kg</strong>
        <button className="button button-secondary" type="button" disabled={busy || disabled || !result || !top || !side}
      onClick={() => void run(async () => {
        if (!result || !top || !side) return;
        await downloadRepeatTest({ pig: session?.pig ?? (pig.trim() || "pig"), scaleKg: session?.scaleKg ?? scale.trim(),
          attempts: [{ number: 1, savedAt: new Date().toISOString(), top, side, result, failure: null }] }, "estimate");
        setMessage("Pig export started.");
      })}>Export pig</button>
      </div>}
      {failure && <p role="status">{failure}</p>}
    </section>}
    {session && <>
      <p><strong>{session.pig}</strong> · {session.scaleKg && <>Scale {session.scaleKg} kg · </>}<strong>{paired} photo pairs saved</strong></p>
      {average !== null && <p><strong>Average estimated weight: {average.toFixed(2)} kg</strong> from {estimatedWeights.length} successful {estimatedWeights.length === 1 ? "pair" : "pairs"}.</p>}
      <ol className="pilot-takes">{session.attempts.map((attempt) => <li key={attempt.number}>
        Attempt {attempt.number} · {attempt.result ? attempt.result.estimated_weight_kg + " kg" : "Failed · " + attempt.failure}
        <div className="camera-tool-row">
          <button type="button" className="button button-secondary" onClick={() => { setEditing(null); setViewing(viewing === attempt.number ? null : attempt.number); }}>
            {viewing === attempt.number ? "Hide photos" : "View photos"}
          </button>
          <button type="button" className="text-button attempt-remove" disabled={blocked} onClick={() => {
            if (!window.confirm(`Remove attempt ${attempt.number} from ${session.pig}?`)) return;
            void run(async () => {
              setSession(await editSession((current) => {
                if (!current || current.pig !== session.pig) throw new Error("The active pig changed. Reload before removing a take.");
                return { ...current, attempts: current.attempts.filter((item) =>
                  item.number !== attempt.number || item.savedAt !== attempt.savedAt) };
              }));
              setViewing(null);
            });
          }}>Remove attempt</button>
        </div>
        {viewing === attempt.number && <>
          <AttemptPhotos attempt={attempt} />
          {attempt.top && attempt.side && <button type="button" className="button button-secondary"
            disabled={busy || disabled} aria-pressed={editing === attempt.number}
            onClick={() => setEditing(editing === attempt.number ? null : attempt.number)}>
            {editing === attempt.number ? "Hide keypoint editor" : "Edit keypoints"}
          </button>}
          {editing === attempt.number && attempt.top && attempt.side && <KeypointReview
            top={attempt.top} side={attempt.side} saving={busy || disabled}
            initial={(attempt.result as (Estimate & { provenance?: { overrides?: Adjustments["overrides"] } }) | null)?.provenance?.overrides}
            onClose={() => setEditing(null)}
            onApply={(adjustments) => void run(async () => {
              if (!attempt.top || !attempt.side) return;
              const body = new FormData();
              attachPhoto(body, "top_image", attempt.top);
              attachPhoto(body, "side_image", attempt.side);
              body.set("adjustments", JSON.stringify(adjustments));
              const result = await request("/estimates?diagnostics=true", isEstimate, { method: "POST", body });
              setSession(await editSession((current) => {
                const saved = current?.attempts.find((item) => item.number === attempt.number && item.savedAt === attempt.savedAt);
                if (!current || current.pig !== session.pig || !saved || JSON.stringify(saved.result) !== JSON.stringify(attempt.result)) {
                  throw new Error("This attempt changed. Reload before editing it again.");
                }
                return { ...current, attempts: current.attempts.map((item) =>
                  item === saved ? { ...item, result, failure: null } : item) };
              }));
              setEditing(null);
              setMessage(`Attempt ${attempt.number} updated.`);
            })} />}
        </>}
      </li>)}</ol>
      <div className="submit-row">
        <button className="button button-primary" type="button" disabled={blocked || !canSave}
          onClick={() => void run(async () => {
            if (!top || !side) throw new Error("Add one top and one side photo before saving.");
            const [topHash, sideHash] = await Promise.all([photoDigest(top), photoDigest(side)]);
            if (topHash === sideHash) throw new Error("Use different photos for the top and side views.");
            const hashes = { top: topHash, side: sideHash };
            const saved = await editSession((current) => {
              if (!current || current.pig !== session.pig || current.attempts.length !== count) {
                throw new Error("This test changed in another tab. Refresh before saving.");
              }
              if (current.attempts.some((attempt) => attempt.hashes && [attempt.hashes.top, attempt.hashes.side]
                .some((hash) => hash === topHash || hash === sideHash))) {
                throw new Error("This test already used one of these photos. Capture a fresh pair.");
              }

              return { ...current, attempts: [...current.attempts, { number: Math.max(0, ...current.attempts.map((attempt) => attempt.number)) + 1,
                savedAt: new Date().toISOString(), hashes, result, failure: result ? null : failure, top, side }] };
            });
            setSession(saved);
            onNext();
            setMessage("Attempt saved. Take a fresh pair to add another.");
          })}>{result ? "Save attempt and start next" : "Save failed attempt and start next"}</button>
        <button className="button button-secondary" type="button" disabled={busy || (!count && !session.batch?.top.length && !session.batch?.side.length)}
          onClick={() => void run(async () => {
            const current = await editSession();
            if (!current || (!current.attempts.length && !current.batch?.top.length && !current.batch?.side.length)) throw new Error("No saved attempts or batch photos to export.");
            await downloadRepeatTest(current, "repeat-test");
            setMessage("Export started.");
          }, true)}>Export all saved attempts</button>
      </div>
      {!canSave && <p>Add both views and request an estimate to save this attempt.</p>}
    </>}
    {message && <p role="status">{message}</p>}
  </section>;
}
