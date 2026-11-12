"use client";

import { useEffect, useRef, useState } from "react";
import { inferenceIssue, previewPhoto, type PhotoView, type PosePreview } from "@/lib/api";
import { KeypointReview, type Adjustments } from "./keypoint-review";
import type { BatchPhoto } from "@/lib/repeat-test";

type Batch = { top: BatchPhoto[]; side: BatchPhoto[] };
type Check = { preview: PosePreview } | { error: string };

export function useBatchKeypoints(batch: Batch | undefined, enabled: boolean): Record<string, Check> {
  const [checks, setChecks] = useState<Record<string, Check>>({});
  useEffect(() => {
    if (!enabled || !batch) return;
    const controller = new AbortController();
    const { signal } = controller;
    async function check(view: PhotoView, photo: BatchPhoto): Promise<void> {
      try {
        const preview = await previewPhoto(view, photo.file, signal);
        if (!signal.aborted) setChecks((current) => ({ ...current, [photo.hash]: { preview } }));
      } catch (error) {
        if (!signal.aborted) setChecks((current) => ({ ...current, [photo.hash]: { error: inferenceIssue(error) } }));
      }
    }
    void (async () => {
      for (let index = 0; index < 3; index++) {
        for (const view of ["top", "side"] as const) {
          if (signal.aborted) return;
          await check(view, batch[view][index]);
        }
      }
    })();
    return () => controller.abort();
  }, [batch, enabled]);
  return checks;
}

function KeypointImage({ file, label, preview, overrides, thumbnail = false }: {
  file: File; label: string; preview?: PosePreview; overrides?: Adjustments["overrides"][PhotoView]; thumbnail?: boolean;
}): React.JSX.Element | null {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const photoUrl = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setUrl(photoUrl));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(photoUrl); };
  }, [file]);
  if (!url) return null;
  if (!preview) {
    // The original photo is an object URL and needs no image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="batch-keypoint-image" src={url} alt={label} />;
  }
  const { width, height, points } = preview;
  const square = Math.min(width, height);
  const bounds = thumbnail ? `${(width - square) / 2} ${(height - square) / 2} ${square} ${square}` : `0 0 ${width} ${height}`;
  return <svg className="batch-keypoint-image" role="img" aria-label={`${label} with detected keypoints`} viewBox={bounds}>
    <image href={url} width={width} height={height} />
    {points.filter(({ x, y }) => x >= 0 && y >= 0 && x < width && y < height).map((point) =>
      <circle key={point.name} cx={overrides?.[point.name]?.[0] ?? point.x} cy={overrides?.[point.name]?.[1] ?? point.y} r={Math.max(width, height) / 85}
        fill={point.clear ? "#55e6a5" : "#ffca63"} stroke="#111" strokeWidth="2" vectorEffect="non-scaling-stroke"><title>{point.name}</title></circle>)}
  </svg>;
}

export function KeypointThumbnail({ photo, label, check, overrides, onOpen }: {
  photo: BatchPhoto; label: string; check?: Check; overrides?: Adjustments["overrides"][PhotoView]; onOpen: (button: HTMLButtonElement) => void;
}): React.JSX.Element {
  return <button type="button" className="keypoint-thumbnail" onClick={(event) => onOpen(event.currentTarget)}
    aria-label={`Enlarge ${label} in keypoint view`} aria-haspopup="dialog">
    <KeypointImage file={photo.file} label={label} preview={check && "preview" in check ? check.preview : undefined} overrides={overrides} thumbnail />
  </button>;
}

export function KeypointPhotoDialog({ top, side, view, label, initial, onSave, onClose }: {
  top: File; side: File; view: PhotoView; label: string; initial?: Adjustments["overrides"];
  onSave: (points: Adjustments) => Promise<void>; onClose: () => void;
}): React.JSX.Element {
  const dialog = useRef<HTMLDialogElement>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  function dismiss(): void {
    dialog.current?.close();
    onClose();
  }

  async function save(points: Adjustments): Promise<void> {
    setSaving(true);
    setError("");
    try {
      await onSave(points);
      dismiss();
    } catch (failure) {
      setError(inferenceIssue(failure));
      setSaving(false);
    }
  }

  return <dialog ref={dialog} className="camera-dialog keypoint-photo-dialog" aria-label={`${label} keypoint view`}
    onCancel={(event) => { event.preventDefault(); if (!saving) dismiss(); }}>
    <div className="camera-dialog-heading"><h3>{label}</h3></div>
    <KeypointReview top={top} side={side} activeView={view} initial={initial} saving={saving} saveError={error}
      onApply={(points) => void save(points)} onClose={dismiss} />
  </dialog>;
}
