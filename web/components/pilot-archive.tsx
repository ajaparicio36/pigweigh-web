"use client";

import Image from "next/image";
import { useEffect, useId, useState } from "react";
import { copyPilotArchive, createPilotArchive, openPilotArchive, pilotArchiveFilename, pilotPhotoFilename, type OpenedPilotArchive } from "@/lib/pilot-archive";
import { formatMoney, formatPublishedAt } from "@/lib/format";
import { SIDE_LANDMARKS, TOP_LANDMARKS, type PilotDetection, type PilotDiagnosticView, type PilotPoint, type PilotResult } from "@/lib/pilot-record";
import styles from "./pilot-archive.module.css";

export type PilotArchiveCurrent = { photos: { top: File | null; side: File | null }; result: PilotResult | null };
export type PilotArchivePanelProps = {
  current: PilotArchiveCurrent | null;
  disabled?: boolean;
  onReanalyze: (photos: { top: File; side: File }) => void;
};

function pointText(point: PilotPoint | null): string {
  return point === null ? "Not used or unavailable" : `${point[0].toFixed(2)}, ${point[1].toFixed(2)} px`;
}
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "The archive could not be processed. Please try again.";
}
function ArchivedImage({ url, label, width, height, diagnostics, landmarks }: {
  url: string; label: string; width: number; height: number; diagnostics: PilotDiagnosticView | null; landmarks: readonly PilotDetection[];
}): React.JSX.Element {
  return <div className={styles.photo} style={{ aspectRatio: `${width} / ${height}` }}>
    <Image src={url} alt={`Archived ${label} photo`} width={width} height={height} unoptimized />
    {diagnostics && <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className={styles.overlay}>
      {Object.entries(diagnostics.segments).map(([name, line]) => <line key={name} x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} vectorEffect="non-scaling-stroke" />)}
      {landmarks.map((item, index) => item.used && <circle key={index} cx={item.used[0]} cy={item.used[1]} r={Math.max(width,height) / 180} vectorEffect="non-scaling-stroke" />)}
    </svg>}
  </div>;
}
function LandmarkList({ title, names, items }: { title: string; names: readonly string[]; items: Record<string, PilotDetection> }): React.JSX.Element {
  return <section><h4>{title}</h4><div className={styles.tableScroll}><table><thead><tr><th>Landmark</th><th>Detected</th><th>Used</th><th>Model score</th></tr></thead>
    <tbody>{names.map((name) => <tr key={name}><th scope="row">{name}</th><td>{pointText(items[name].detected)}{items[name].withinImage === false ? " (outside photo)" : ""}</td><td>{pointText(items[name].used)}</td><td>{items[name].confidence === null ? "Unavailable" : items[name].confidence}</td></tr>)}</tbody></table></div></section>;
}
export function PilotArchivePanel({ current, disabled = false, onReanalyze }: PilotArchivePanelProps): React.JSX.Element {
  const prefix = useId();
  const [label, setLabel] = useState("");
  const [attempt, setAttempt] = useState("");
  const [scaleWeightKg, setScaleWeightKg] = useState("");
  const [opened, setOpened] = useState<OpenedPilotArchive | null>(null);
  const [preview, setPreview] = useState<{ opened: OpenedPilotArchive; urls: { top: string; side: string } } | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!opened) return;
    const top = URL.createObjectURL(opened.photos.top);
    const side = URL.createObjectURL(opened.photos.side);
    const frame = requestAnimationFrame(() => setPreview({ opened, urls: { top, side } }));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(top); URL.revokeObjectURL(side); };
  }, [opened]);

  async function save(): Promise<void> {
    const top = current?.photos.top;
    const side = current?.photos.side;
    if (!current || !top || !side || pending || disabled) return;
    setPending(true); setMessage(""); setError("");
    try {
      const archive = await createPilotArchive({ photos: { top, side }, result: current.result, label, attempt, scaleWeightKg: scaleWeightKg.trim() || null });
      download(archive, pilotArchiveFilename(label, attempt));
      setMessage("Download started. Keep or delete the ZIP using your device's files.");
    } catch (failure: unknown) { setError(errorText(failure)); }
    finally { setPending(false); }
  }
  function savePhoto(view: "top" | "side"): void {
    const photo = current?.photos[view];
    if (!photo || pending || disabled) return;
    download(photo, pilotPhotoFilename(label, attempt, view, photo.type));
    setError("");
    setMessage(`${view === "top" ? "Top" : "Side"} photo download started. The original file may contain EXIF metadata.`);
  }
  async function saveOpened(): Promise<void> {
    if (!opened || pending || disabled) return;
    setPending(true); setMessage(""); setError("");
    try {
      download(await copyPilotArchive(opened), pilotArchiveFilename(opened.record.label, opened.record.attempt));
      setMessage("A copy of the unchanged archived record was downloaded.");
    } catch (failure: unknown) { setError(errorText(failure)); }
    finally { setPending(false); }
  }
  async function open(file: File): Promise<void> {
    if (pending || disabled) return;
    setPending(true); setMessage(""); setError("");
    try { setOpened(await openPilotArchive(file)); setMessage("Archived record opened for reading. No new analysis was run."); }
    catch (failure: unknown) { setOpened(null); setError(errorText(failure)); }
    finally { setPending(false); }
  }
  const urls = preview?.opened === opened ? preview?.urls : null;
  const result = opened?.record.result;
  const topLandmarks = result?.provenance.landmarks?.top;
  const sideLandmarks = result?.provenance.landmarks?.side;
  return <section className={styles.panel} aria-labelledby={`${prefix}-title`}>
    <h2 id={`${prefix}-title`}>Save or open a pilot record</h2>
    <p>Downloads keep the original photos and any embedded EXIF metadata, pilot labels, result, and price details on this device. You control where to keep or delete them.</p>
    <p>Labels are your notes and do not verify the pig’s identity. ZIP checks detect mismatched photo bytes; they do not prove who created a record.</p>
    <div className={styles.fields}>
      <div><label htmlFor={`${prefix}-label`}>Pilot label <span>(optional)</span></label><input id={`${prefix}-label`} value={label} maxLength={80} disabled={pending || disabled} onChange={(event) => setLabel(event.target.value)} /></div>
      <div><label htmlFor={`${prefix}-attempt`}>Attempt <span>(optional)</span></label><input id={`${prefix}-attempt`} value={attempt} maxLength={40} disabled={pending || disabled} onChange={(event) => setAttempt(event.target.value)} /></div>
      <div><label htmlFor={`${prefix}-scale`}>Scale weight in kg <span>(optional)</span></label><input id={`${prefix}-scale`} value={scaleWeightKg} inputMode="decimal" maxLength={10} disabled={pending || disabled} aria-describedby={`${prefix}-scale-help`} onChange={(event) => setScaleWeightKg(event.target.value)} /><p id={`${prefix}-scale-help`}>Your recorded scale reading, separate from the estimate.</p></div>
    </div>
    <div className={styles.actions}>
      <button type="button" className="button button-secondary" disabled={!current?.photos.top || pending || disabled} onClick={() => savePhoto("top")}>Download top photo</button>
      <button type="button" className="button button-secondary" disabled={!current?.photos.side || pending || disabled} onClick={() => savePhoto("side")}>Download side photo</button>
      <button type="button" className="button button-secondary" disabled={!current?.photos.top || !current?.photos.side || pending || disabled} onClick={() => void save()}>{pending ? "Processing…" : "Download pilot ZIP"}</button>
      <div><label htmlFor={`${prefix}-open`}>Open a saved pilot ZIP</label><input id={`${prefix}-open`} type="file" accept=".zip,application/zip" disabled={pending || disabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void open(file); }} /></div>
    </div>
    {message && <p role="status">{message}</p>}{error && <p className={styles.error} role="alert">{error}</p>}
    {opened && <article className={styles.record} aria-labelledby={`${prefix}-record`}>
      <h3 id={`${prefix}-record`}>Archived record — read only</h3>
      <p>Saved {formatPublishedAt(opened.record.createdAt)}. This is the saved record, not a new calculation.</p>
      <dl className={styles.summary}><div><dt>Pilot label</dt><dd>{opened.record.label || "Not provided"}</dd></div><div><dt>Attempt</dt><dd>{opened.record.attempt || "Not provided"}</dd></div><div><dt>Recorded scale weight</dt><dd>{opened.record.scaleWeightKg ? `${opened.record.scaleWeightKg} kg` : "Not provided"}</dd></div></dl>
      {urls && <div className={styles.photos}>
        <div><h4>Top view</h4><ArchivedImage url={urls.top} label="top view" width={opened.record.photos.top.width} height={opened.record.photos.top.height} diagnostics={result?.diagnostics?.top ?? null} landmarks={topLandmarks ? TOP_LANDMARKS.map((name) => topLandmarks[name]) : []} /></div>
        <div><h4>Side view</h4><ArchivedImage url={urls.side} label="side view" width={opened.record.photos.side.width} height={opened.record.photos.side.height} diagnostics={result?.diagnostics?.side ?? null} landmarks={sideLandmarks ? SIDE_LANDMARKS.map((name) => sideLandmarks[name]) : []} /></div>
      </div>}
      {result ? <>
        <h4>{result.provenance.source === "manually_adjusted" ? "Manually adjusted estimate" : "Automatic estimate"}</h4>
        <p>Saved weight: {result.estimate.estimated_weight_kg} kg. Saved valuation: {result.estimate.valuation ? formatMoney(result.estimate.valuation.amount_php) : "Unavailable"}.</p>
        {result.estimate.valuation && <p>Price: {formatMoney(result.estimate.valuation.price.php_per_kg)} per kg; source: {result.estimate.valuation.price.source_reference}; published {formatPublishedAt(result.estimate.valuation.price.published_at)}.</p>}
        <dl className={styles.summary}><div><dt>Body length</dt><dd>{result.estimate.measurements.body_length_cm} cm</dd></div><div><dt>Chest width</dt><dd>{result.estimate.measurements.chest_width_cm} cm</dd></div><div><dt>Chest depth</dt><dd>{result.estimate.measurements.chest_depth_cm} cm</dd></div><div><dt>Girth</dt><dd>{result.estimate.measurements.girth_cm} cm</dd></div><div><dt>Method</dt><dd>{result.estimate.method.version}</dd></div><div><dt>Model bundle</dt><dd>{result.estimate.artifacts.bundle_id}</dd></div></dl>
        <p>These are experimental photo-derived estimates; accuracy against scale weights has not been evaluated.</p>
        {topLandmarks && sideLandmarks && <details><summary>Saved detected and used landmarks</summary><p>Coordinates are in EXIF-oriented photo pixels. Model scores are not weight accuracy.</p><LandmarkList title="Top view" names={TOP_LANDMARKS} items={topLandmarks} /><LandmarkList title="Side view" names={SIDE_LANDMARKS} items={sideLandmarks} /></details>}
      </> : <p>No estimate was saved with this photo pair.</p>}
      <div className={styles.actions}>
        <button type="button" className="button button-secondary" disabled={pending || disabled} onClick={() => void saveOpened()}>Download a copy of this record</button>
        <button type="button" className="button button-secondary" disabled={pending || disabled} onClick={() => onReanalyze(opened.photos)}>Reanalyze these photos</button>
      </div>
      <p>Reanalysis sends the photos for new checks and may use a different model or current price. The archived record above stays unchanged.</p>
    </article>}
  </section>;
}
