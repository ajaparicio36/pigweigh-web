"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ApiError, inferenceIssue, attachPhoto, isEstimate, request, retryInference, validatePhoto, type Estimate, type PhotoView } from "@/lib/api";
import { KeypointPhotoDialog, KeypointThumbnail, useBatchKeypoints } from "./batch-keypoint-preview";
import { ElapsedTime, StatusDot } from "./detection-status";
import { CameraModal } from "./camera-modal";
import { PhotoCheckQueue } from "@/lib/photo-checks";
import { photoValidationError } from "@/lib/camera";
import { KeypointReview, type Adjustments } from "./keypoint-review";
import { ATTEMPTS_PER_PIG, editSession, listPigs, openPig, photoDigest, removePig, type BatchPhoto, type RepeatAttempt, type RepeatSession } from "@/lib/repeat-test";

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

function sameDay(timestamp: string | number, today: string): boolean {
  return new Date(timestamp).toDateString() === today;
}

type GalleryPair = Pick<RepeatAttempt, "top" | "side"> & Partial<RepeatAttempt>;

function todayPhotos(session: RepeatSession, today: string): GalleryPair[] {
  const attempts = session.attempts.filter((item) => sameDay(item.savedAt, today) && (item.top || item.side));
  const batch = session.batch;
  if (!batch) return attempts;
  const unsaved = Array.from({ length: Math.max(batch.top.length, batch.side.length) }, (_, index) => {
    const top = batch.top[index];
    const side = batch.side[index];
    const alreadySaved = attempts.some((item) => top && side
      && item.hashes?.top === top.hash && item.hashes?.side === side.hash);
    if (alreadySaved) return [];
    const topFile = top && sameDay(top.savedAt ?? top.file.lastModified, today) ? top.file : null;
    const sideFile = side && sameDay(side.savedAt ?? side.file.lastModified, today) ? side.file : null;
    return topFile || sideFile ? [{ top: topFile, side: sideFile }] : [];
  }).flat();
  return [...attempts, ...unsaved];
}

function savedOverrides(result: Estimate | null | undefined): Adjustments["overrides"] | undefined {
  return (result as (Estimate & { provenance?: { overrides?: Adjustments["overrides"] } }) | null)?.provenance?.overrides;
}

function pairKey(top: string, side: string): string {
  return `${top}:${side}`;
}

function savedPair(session: RepeatSession, top: string, side: string): RepeatAttempt | undefined {
  return session.attempts.find((item) => item.result && item.hashes?.top === top && item.hashes.side === side);
}

function editedResult(session: RepeatSession, top: string, side: string): Estimate | undefined {
  return session.pendingKeypointResults?.[pairKey(top, side)] ?? savedPair(session, top, side)?.result ?? undefined;
}

async function estimatePhotos(top: File, side: File, points?: Adjustments): Promise<Estimate> {
  const body = new FormData();
  attachPhoto(body, "top_image", top);
  attachPhoto(body, "side_image", side);
  if (points) body.set("adjustments", JSON.stringify(points));
  return retryInference(() => request("/estimates?diagnostics=true", isEstimate, { method: "POST", body }));
}

function PigCover({ file }: { file: File }): React.JSX.Element {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setUrl(next));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(next); };
  }, [file]);
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="pig-gallery-image" src={url || undefined} alt="" />;
}

function PigGallery({ pigs, blocked, onOpen, onRemove, onReview }: {
  pigs: RepeatSession[];
  blocked: boolean;
  onOpen: (pig: string) => void;
  onRemove: (pig: string) => void;
  onReview: (pig: string, photo: GalleryPair, points: Adjustments) => Promise<boolean>;
}): React.JSX.Element {
  const [selected, setSelected] = useState("");
  const [slide, setSlide] = useState(0);
  const [editingPair, setEditingPair] = useState(false);
  const galleryId = useId();
  const today = pigs.length ? new Date().toDateString() : "";
  const gallery = pigs.map((entry) => ({ ...entry, photos: todayPhotos(entry, today) }))
    .filter(({ createdAt, photos }) => photos.length > 0 || (createdAt && sameDay(createdAt, today)));

  const rail = useRef<HTMLUListElement>(null);
  const active = gallery.find((entry) => entry.pig === selected);
  const photos = active?.photos ?? [];
  const photoIndex = Math.max(0, Math.min(slide, photos.length - 1));
  const photo = photos[photoIndex];
  const pig = active?.pig ?? "";
  function scrollCards(direction: number): void {
    const track = rail.current;
    const card = track?.firstElementChild;
    if (!track || !card) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * (card.getBoundingClientRect().width + 12), behavior: reduceMotion ? "instant" : "smooth" });
  }

  return <section className="pilot-section" aria-label="Today's pigs">
    <div className="pig-gallery-heading">
      <h3>Today’s pigs</h3>
      {gallery.length > 1 && <div className="pig-gallery-arrows">
        <button type="button" className="button button-secondary" aria-label="Previous pig cards" onClick={() => scrollCards(-1)}>←</button>
        <button type="button" className="button button-secondary" aria-label="Next pig cards" onClick={() => scrollCards(1)}>→</button>
      </div>}
    </div>
    {gallery.length ? <ul ref={rail} className="pig-gallery">
      {gallery.map(({ pig: name, photos: pairs }) => {
        const expanded = selected === name;
        const cover = pairs[0]?.side ?? pairs[0]?.top;
        const label = name === "Pig 10 preview" ? "Pig 10" : name;
        return <li className="pig-gallery-card" key={name}>
          <div className="pig-card-heading">
            <strong title={name}>{label}</strong>
            <span>{pairs.length} {pairs.length === 1 ? "photo set" : "photo sets"}</span>
            <button type="button" className="text-button attempt-remove pig-card-remove" disabled={blocked}
              aria-label={`Remove pig ${name}`} onClick={() => onRemove(name)}>Remove pig</button>
          </div>
          <button type="button" className="pig-card-cover" aria-label={expanded ? `Hide photos for ${name}` : `View photos for ${name}`}
            aria-expanded={expanded} aria-controls={galleryId}
            onClick={() => { setSelected(expanded ? "" : name); setSlide(0); setEditingPair(false); }}>
            {cover && <PigCover file={cover} />}
            <span>{expanded ? "Hide photos" : cover ? "View photos ↗" : "No photos yet"}</span>
          </button>
        </li>;
      })}
    </ul> : <p>Pigs you add today will appear here.</p>}
    <div id={galleryId} hidden={!active} className="pig-gallery-details">
      {active && <>
        <h4>{pig === "Pig 10 preview" ? "Pig 10" : pig}</h4>
              {editingPair && photo?.top && photo.side ? <KeypointReview top={photo.top} side={photo.side} saving={blocked}
                initial={savedOverrides(photo.result)}
                onClose={() => setEditingPair(false)}
                onApply={(points) => void onReview(pig, photo, points).then((applied) => { if (applied) setEditingPair(false); })} />
                : photos.length ? <AttemptPhotos attempt={photo} /> : <p>No photos saved for this pig yet.</p>}
              {photos.length > 1 && <div className="pig-pair-nav" aria-label="Photo set controls">
                <button type="button" className="button button-secondary" aria-label="Previous pair" disabled={photoIndex === 0} onClick={() => { setSlide(photoIndex - 1); setEditingPair(false); }}>←</button>
                <span aria-live="polite">Pair {photoIndex + 1} of {photos.length}</span>
                <button type="button" className="button button-secondary" aria-label="Next pair" disabled={photoIndex + 1 >= photos.length} onClick={() => { setSlide(photoIndex + 1); setEditingPair(false); }}>→</button>
              </div>}
              <div className="pig-preview-actions">
                {!editingPair && <button type="button" className="button button-primary"
                  disabled={blocked} onClick={() => onOpen(pig)}>Capture photos</button>}
                {!editingPair && photo?.number !== undefined && photo?.top && photo.side && <button type="button" className="button button-secondary" disabled={blocked}
                  onClick={() => setEditingPair(true)}>Review keypoints</button>}
              </div>
      </>}
    </div>
  </section>;
}

export function RepeatTest({ estimationReady }: { estimationReady: boolean }): React.JSX.Element {
  const [pigs, setPigs] = useState<RepeatSession[]>([]);
  const [session, setSession] = useState<RepeatSession | null>(null);
  const [pig, setPig] = useState("");
  const [addingPig, setAddingPig] = useState(false);
  const [ready, setReady] = useState(false);
  const [camera, setCamera] = useState<"top" | "side" | null>(null);
  const closeCamera = useCallback(() => setCamera(null), []);
  const [photoChecks] = useState(() => new PhotoCheckQueue(validatePhoto));
  useEffect(() => {
    photoChecks.resume();
    return () => photoChecks.dispose();
  }, [photoChecks]);
  const [showKeypoints, setShowKeypoints] = useState(false);
  const [enlarged, setEnlarged] = useState<{ index: number; view: PhotoView; label: string; trigger: HTMLButtonElement } | null>(null);
  const [estimateProgress, setEstimateProgress] = useState<number | null>(null);
  const [estimateError, setEstimateError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const lock = useRef(false);

  useEffect(() => {
    let active = true;
    void Promise.all([editSession(), listPigs()]).then(([current, savedPigs]) => {
      if (!active) return;
      setPigs(savedPigs);
      setSession(current);
      let draftPig = "";
      try {
        draftPig = localStorage.getItem("pigweigh-draft-pig") ?? "";
      } catch { /* The active test is stored separately. */ }
      setPig(current?.pig ?? draftPig);
      setReady(true);
    }).catch(() => { if (active) setMessage("This browser could not open local test storage."); });
    return () => { active = false; };
  }, []);

  function savePigId(value: string): void {
    setPig(value);
    try { localStorage.setItem("pigweigh-draft-pig", value); }
    catch { setMessage("This browser could not save the test fields as a draft."); }
  }

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try { await action(); setPigs(await listPigs()); return true; }
    catch (error) { setMessage(error instanceof Error ? error.message : "The change could not be saved."); return false; }
    finally { lock.current = false; setBusy(false); }
  }

  const blocked = !ready || busy;
  const batch = session?.batch;
  const batchComplete = !!batch && batch.top.length >= 3 && batch.side.length >= 3;
  const checks = useBatchKeypoints(batch, batchComplete && showKeypoints && !busy && !addingPig && !enlarged);
  const previewChecks = batchComplete ? [...batch.top.slice(0, 3), ...batch.side.slice(0, 3)].map(({ hash }) => checks[hash]) : [];
  const weights = session?.attempts.flatMap(({ result }) => result ? [Number(result.estimated_weight_kg)] : []) ?? [];
  const matchesBatch = !batch || (batch.top.length >= 3 && batch.side.length >= 3 &&
    batch.top.slice(0, 3).every(({ hash }, index) => session && savedPair(session, hash, batch.side[index].hash)));
  const average = weights.length ? weights.reduce((sum, weight) => sum + weight, 0) / weights.length : null;

  async function selectPig(id: string): Promise<void> {
    setShowKeypoints(false);
    setEstimateError("");
    setSession(await openPig(id, ""));
    setAddingPig(false);
    savePigId(id);
  }

  async function addPhotos(view: "top" | "side", files: File[]): Promise<boolean> {
    if (!session || !files.length) return false;
    return run(async () => {
      const additions: BatchPhoto[] = [];
      for (const file of files) {
        const problem = photoValidationError(file);
        if (problem) throw new Error(problem);
        additions.push({ file, hash: await photoDigest(file), savedAt: new Date().toISOString() });
      }
      const updated = await editSession((current) => {
        if (!current || current.pig !== session.pig) throw new Error("Open the pig again.");
        const photos = current.batch ?? { top: [], side: [] };
        if (photos[view].length + additions.length > ATTEMPTS_PER_PIG) throw new Error("Choose up to three photos per view.");
        const hashes = [...photos.top, ...photos.side, ...additions].map(({ hash }) => hash);
        if (new Set(hashes).size !== hashes.length) throw new Error("Choose a different photo for each slot.");
        return { ...current, batch: { ...photos, [view]: [...photos[view], ...additions] } };
      });
      setSession(updated);
      if (updated?.batch?.[view].length === ATTEMPTS_PER_PIG) closeCamera();
    });
  }

  function estimateBatch(): void {
    if (!session || !batch || batch.top.length < 3 || batch.side.length < 3 || !estimationReady) return;
    setShowKeypoints(false);
    setEstimateError("");
    void run(async () => {
      const attempts: RepeatAttempt[] = [];
      for (const [index, top] of batch.top.slice(0, 3).entries()) {
        const side = batch.side[index];
        setEstimateProgress(index + 1);
        const hashes = { top: top.hash, side: side.hash };
        const existing = savedPair(session, hashes.top, hashes.side);
        if (existing) {
          attempts.push({ ...existing, number: index + 1 });
          continue;
        }
        try {
          const result = session.pendingKeypointResults?.[pairKey(hashes.top, hashes.side)] ?? await estimatePhotos(top.file, side.file);
          attempts.push({ number: index + 1, hashes, savedAt: new Date().toISOString(), result, failure: null, top: top.file, side: side.file });
        } catch (error) {
          if (error instanceof ApiError && error.status === 422) {
            const view = error.view === "top" ? "Top view" : error.view === "side" ? "Side view" : "Photo set";
            setEstimateError(`${view} ${index + 1}: ${error.message}`);
          } else {
            setEstimateError(inferenceIssue(error));
          }
          return;
        }
      }
      setSession(await editSession((current) => {
        if (!current || current.pig !== session.pig || JSON.stringify(current.attempts) !== JSON.stringify(session.attempts)
          || JSON.stringify(current.pendingKeypointResults) !== JSON.stringify(session.pendingKeypointResults)
          || (["top", "side"] as const).some((view) => current.batch?.[view].length !== batch[view].length
            || batch[view].some((photo, index) => current.batch?.[view][index]?.hash !== photo.hash))) {
          throw new Error("This pig changed in another tab. Reopen it before estimating.");
        }
        return { ...current, attempts, pendingKeypointResults: undefined };
      }));
      setMessage("Average weight saved.");
    }).finally(() => setEstimateProgress(null));
  }

  async function applySavedPoints(pigId: string, photo: GalleryPair, points: Adjustments): Promise<void> {
    if (!photo.top || !photo.side) return;
    const result = await estimatePhotos(photo.top, photo.side, points);
    const updated = await editSession((current) => {
      const attempt = current?.attempts.find((item) => item.number === photo.number && item.savedAt === photo.savedAt);
      if (!current || !attempt || JSON.stringify(attempt.result) !== JSON.stringify(photo.result)) {
        throw new Error("This attempt changed. Reopen the pig before editing it again.");
      }
      return { ...current, attempts: current.attempts.map((item) => item === attempt ? { ...item, result, failure: null } : item) };
    }, pigId);
    if (session?.pig === pigId) setSession(updated);
    setMessage("Keypoints and weight updated.");
  }

  async function saveBatchPoints(index: number, points: Adjustments): Promise<void> {
    if (!session || !batch) throw new Error("Open the pig again before saving.");
    const top = batch.top[index];
    const side = batch.side[index];
    const key = pairKey(top.hash, side.hash);
    const result = await estimatePhotos(top.file, side.file, points);
    const updated = await editSession((current) => {
      if (!current || current.pig !== session.pig || current.batch?.top[index]?.hash !== top.hash
        || current.batch.side[index]?.hash !== side.hash
        || JSON.stringify(editedResult(current, top.hash, side.hash)) !== JSON.stringify(editedResult(session, top.hash, side.hash))) {
        throw new Error("These photos or points changed. Reopen the pig before saving.");
      }
      const saved = savedPair(current, top.hash, side.hash);
      if (saved) {
        return { ...current, attempts: current.attempts.map((item) => item === saved ? { ...item, result } : item) };
      }
      return { ...current, pendingKeypointResults: { ...current.pendingKeypointResults, [key]: result } };
    });
    setSession(updated);
    setMessage(savedPair(session, top.hash, side.hash) ? "Keypoints and weight updated." : "Keypoints saved.");
  }

  const enlargedTop = enlarged && batch?.top[enlarged.index];
  const enlargedSide = enlarged && batch?.side[enlarged.index];
  return <section id="pig-test" className="result-panel pig-attempts" aria-label="Pig photos">
    {addingPig ? <form className="add-pig-form" onSubmit={(event) => {
      event.preventDefault();
      void run(async () => {
        const pigId = pig.trim();
        if (!pigId) throw new Error("Enter a pig ID, such as Pig 1.");
        await selectPig(pigId);
      });
    }}>
      <div className="field">
        <label htmlFor="repeat-pig-id">Pig ID</label>
        <input id="repeat-pig-id" value={pig} placeholder="e.g. Pig 1"
          onChange={(event) => savePigId(event.target.value)} maxLength={80} required />
      </div>
      <div className="camera-tool-row">
        <button type="submit" className="button button-primary" disabled={blocked || !pig.trim()}>Start capture</button>
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => setAddingPig(false)}>Cancel</button>
      </div>
    </form> : <button className="button button-primary" type="button" disabled={blocked}
      onClick={() => {
        if (pig === session?.pig) savePigId("");
        setAddingPig(true);
      }}>Add new pig</button>}
    <h2>Pig photos</h2>
    <PigGallery pigs={pigs} blocked={blocked}
      onOpen={(id) => void run(() => selectPig(id))}
      onReview={async (id, photo, points) => {
        let applied = false;
        await run(async () => {
          await applySavedPoints(id, photo, points);
          applied = true;
        });
        return applied;
      }}
      onRemove={(id) => {
        if (!window.confirm(`Remove ${id} and all its saved photos and weight from this browser?`)) return;
        void run(async () => {
          if (await removePig(id)) {
            setSession(null);
            savePigId("");
          }
          setMessage(`Removed ${id}.`);
        });
      }} />
    {!addingPig && session && <section className="pilot-section" aria-label="Pig photo capture">
      <h3>{session.pig}</h3>
      {batchComplete && <button type="button" className="button button-secondary" aria-pressed={showKeypoints}
        disabled={blocked} onClick={() => setShowKeypoints(!showKeypoints)}>
        {showKeypoints ? "Hide keypoint preview" : "Show keypoint preview"}
      </button>}
      {batchComplete && showKeypoints && previewChecks.every(Boolean) && previewChecks.some((check) => "error" in check) &&
        <p role="alert">Some keypoints could not load. Toggle the preview to retry.</p>}
      <p>Take three photos from above, then three from the side. Keep the ArUco marker visible in each photo.</p>
      {(["top", "side"] as const).map((view) => {
        const photos = batch?.[view].slice(0, ATTEMPTS_PER_PIG) ?? [];
        const viewFull = photos.length >= ATTEMPTS_PER_PIG;
        const label = view === "top" ? "Top view" : "Side view";
        return <section key={view} className="pilot-section">
          <h4>{label} · {photos.length}/3 photos</h4>
          <div className="pig-capture-thumbnails">
            {photos.map((photo, index) => <div key={photo.hash}>
              {showKeypoints ? <KeypointThumbnail photo={photo} check={checks[photo.hash]} label={`${label} photo ${index + 1}`}
                overrides={batchComplete ? savedOverrides(editedResult(session, batch.top[index].hash, batch.side[index].hash))?.[view] : undefined}
                onOpen={(trigger) => setEnlarged({ index, view, trigger, label: `${label} photo ${index + 1}` })} /> : <PigCover file={photo.file} />}
              <button type="button" className="text-button attempt-remove" disabled={blocked}
                onClick={() => void run(async () => {
                  setShowKeypoints(false);
                  setEstimateError("");
                  setSession(await editSession((current) => {
                    if (!current?.batch || current.pig !== session.pig) throw new Error("Open the pig again.");
                    const pendingKeypointResults = Object.fromEntries(Object.entries(current.pendingKeypointResults ?? {})
                      .filter(([key]) => !key.split(":").includes(photo.hash)));
                    return { ...current, pendingKeypointResults,
                      batch: { ...current.batch, [view]: current.batch[view].filter((savedPhoto) => savedPhoto.hash !== photo.hash) } };
                  }));
                })}>Remove {view} photo {index + 1}</button>
            </div>)}
          </div>
          <button type="button" className="button button-primary" disabled={blocked || viewFull}
            onClick={() => setCamera(view)}>Take {view} photo</button>
          <label className="pig-upload-field">Upload {view} photos <input type="file" accept="image/jpeg,image/png,image/webp" multiple
            disabled={blocked || viewFull} onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              event.currentTarget.value = "";
              if (!blocked && !viewFull) void addPhotos(view, files);
            }} /></label>
        </section>;
      })}
      {camera && <CameraModal view={camera} disabled={false} keepOpen captureBusy={busy} onClose={closeCamera}
        batchProgress={{ saved: batch?.[camera].length ?? 0, total: ATTEMPTS_PER_PIG }} captureError={message}
        guidedCapture={estimationReady ? {
          checkCandidate: (view, file, signal) => photoChecks.checkCandidate(view, file, signal),
          onAccept: ({ file }) => addPhotos(camera, [file]),
        } : undefined}
        onCapture={(file) => { void addPhotos(camera, [file]); }} />}
      <div className="camera-tool-row">
        <button type="button" className="button button-primary" disabled={blocked || !estimationReady || !batchComplete}
          onClick={estimateBatch}>Estimate weight</button>
      </div>
      {estimateProgress !== null && <div className="camera-stage-label">
        <span role="status"><StatusDot tone="wait" active>Running inference · photo set {estimateProgress} of 3</StatusDot></span>
        <ElapsedTime />
      </div>}
      {estimateError && <p role="alert"><StatusDot tone="bad">{estimateError}</StatusDot></p>}
      {showKeypoints && enlarged && enlargedTop && enlargedSide && <KeypointPhotoDialog
        top={enlargedTop.file} side={enlargedSide.file} view={enlarged.view} label={enlarged.label}
        initial={savedOverrides(editedResult(session, enlargedTop.hash, enlargedSide.hash))}
        onSave={(points) => saveBatchPoints(enlarged.index, points)}
        onClose={() => { enlarged.trigger.focus(); setEnlarged(null); }} />}
      {average !== null && <p><strong>{matchesBatch ? "Average estimated weight" : "Last saved average"}: {average.toFixed(2)} kg</strong></p>}
    </section>}
    {message && <p role="status">{message}</p>}
  </section>;
}
