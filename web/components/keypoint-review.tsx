"use client";

import { useEffect, useState, type PointerEvent } from "react";
import { attachPhoto, errorMessage, request, retryInference, type PhotoView } from "@/lib/api";
import { SIDE_ANCHORS, TOP_ANCHORS, inversePilotHomography, projectPilotPoint, type PilotSegment } from "@/lib/pilot-record";

type Point = [number, number];
type ViewData = {
  width: number; height: number; image_sha256: string; bounding_box: [number, number, number, number];
  image_to_marker: number[];
  landmarks: Record<string, { used: Point | null }>;
};
type CheckedView = { artifacts: { bundle_id: string }; diagnostics: ViewData };
export type Adjustments = {
  version: 1; bundle_id: string; image_sha256: Record<PhotoView, string>;
  overrides: Record<PhotoView, Record<string, Point>>;
};
const names = { top: TOP_ANCHORS, side: SIDE_ANCHORS };
function isChecked(value: unknown, view: PhotoView): value is CheckedView {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<CheckedView>;
  const d = v.diagnostics;
  return typeof v.artifacts?.bundle_id === "string" && !!d
    && Number.isFinite(d.width) && d.width > 0 && Number.isFinite(d.height) && d.height > 0
    && typeof d.image_sha256 === "string" && /^[a-f0-9]{64}$/.test(d.image_sha256)
    && Array.isArray(d.image_to_marker) && d.image_to_marker.length === 9 && d.image_to_marker.every(Number.isFinite)
    && Array.isArray(d.bounding_box) && d.bounding_box.length === 4 && d.bounding_box.every(Number.isFinite)
    && names[view].every((name) => {
      const point = d.landmarks?.[name]?.used;
      return Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);
    });
}

export function KeypointReview({ top, side, initial, onApply, onClose, saving = false, activeView, saveError }: {
  activeView?: PhotoView; saveError?: string; top: File; side: File; initial?: Adjustments["overrides"]; saving?: boolean; onApply: (edits: Adjustments) => void; onClose: () => void;
}): React.JSX.Element {
  const [data, setData] = useState<Record<PhotoView, CheckedView> | null>(null);
  const [urls, setUrls] = useState<Record<PhotoView, string> | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<{ view: PhotoView; name: string } | null>(null);
  const [edits, setEdits] = useState<Adjustments["overrides"]>(initial ?? { top: {}, side: {} });
  useEffect(() => {
    const controller = new AbortController();
    const photos = { top: URL.createObjectURL(top), side: URL.createObjectURL(side) };
    async function check(view: PhotoView, file: File): Promise<CheckedView> {
      const body = new FormData();
      attachPhoto(body, "image", file);
      return retryInference(() => request(`/photos/${view}/validate?diagnostics=true`,
        (value): value is CheckedView => isChecked(value, view), { method: "POST", body, signal: controller.signal }), controller.signal);
    }
    void (async () => {
      try {
        const topCheck = await check("top", top);
        const sideCheck = await check("side", side);
        if (controller.signal.aborted) return;
        if (topCheck.artifacts.bundle_id !== sideCheck.artifacts.bundle_id) throw new Error("The model changed. Open review again.");
        setUrls(photos);
        setData({ top: topCheck, side: sideCheck });
      } catch (failure) {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      }
    })();
    return () => { controller.abort(); URL.revokeObjectURL(photos.top); URL.revokeObjectURL(photos.side); };
  }, [top, side]);

  function move(view: PhotoView, event: PointerEvent<SVGSVGElement>, name: string): void {
    if (!name) return;
    const transform = event.currentTarget.getScreenCTM();
    if (!transform) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(transform.inverse());
    place(view, name, p.x, p.y);
  }
  function place(view: PhotoView, name: string, x: number, y: number): void {
    const d = data?.[view].diagnostics;
    if (!d) return;
    const [left, upper, right, lower] = d.bounding_box;
    const point: Point = [Math.max(0, left, Math.min(d.width - 1, right, x)),
      Math.max(0, upper, Math.min(d.height - 1, lower, y))];
    setEdits((current) => ({ ...current, [view]: { ...current[view], [name]: point } }));
  }
  return <section className="keypoint-panel" aria-label="Review keypoints">
    <p>Drag and drop the points to adjust them.</p>
    {(error || saveError) && <p role="alert">{error || saveError}</p>}
    {!error && !data && <p role="status">Loading detected points…</p>}
    {data && !error &&
      <div className="submit-row">
        <button type="button" className="button button-secondary" disabled={saving} onClick={() => setEdits((current) => activeView ? { ...current, [activeView]: {} } : { top: {}, side: {} })}>Reset points</button>
        <button type="button" className="button button-primary" disabled={saving} onClick={() => onApply({
          version: 1, bundle_id: data.top.artifacts.bundle_id,
          image_sha256: { top: data.top.diagnostics.image_sha256, side: data.side.diagnostics.image_sha256 }, overrides: edits,
        })}>{saving ? "Saving points…" : "Save points"}</button>
      </div>
    }
    <div className={activeView ? undefined : "photo-grid"}>
      {(activeView ? [activeView] : ["top", "side"] as const).map((view) => {
        const d = data?.[view].diagnostics;
        const file = view === "top" ? top : side;
        const label = view === "top" ? "Top view" : "Side view";
        return <div className="photo-card keypoint-photo" key={view}>
          <div className="photo-heading"><h3>{label}</h3><span className="photo-state">Marker view</span></div>
          {d && urls ? (() => {
              const lines: { name: string; segment: PilotSegment }[] = [];
              {
                const point = (name: string) => edits[view][name] ?? d.landmarks[name]?.used;
                if (view === "side") {
                  const withers = point("withers"), sternum = point("sternum");
                  if (withers && sternum) lines.push({ name: "Chest depth", segment: [withers, sternum] });
                } else {
                  const leftChest = point("left-chest"), rightChest = point("right-chest");
                  if (leftChest && rightChest) lines.push({ name: "Chest width", segment: [leftChest, rightChest] });
                  const leftEar = point("left-ear-base"), rightEar = point("right-ear-base"), tail = point("tail-base");
                  const inverse = inversePilotHomography(d.image_to_marker);
                  const left = leftEar && projectPilotPoint(d.image_to_marker, leftEar);
                  const right = rightEar && projectPilotPoint(d.image_to_marker, rightEar);
                  if (inverse && left && right && tail) {
                    const midpoint = projectPilotPoint(inverse, [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2]);
                    if (midpoint) lines.push({ name: "Body length", segment: [midpoint, tail] });
                  }
                }
              }
            return (
                  <svg viewBox={`0 0 ${d.width} ${d.height}`} style={{ width: "100%", maxHeight: "65vh" }}
                    aria-label={`Editable ${view} photo`}
                    onPointerDown={(event) => {
                      const name = (event.target as SVGElement).dataset.point;
                      if (!name || saving) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setDragging({ view, name });
                      move(view, event, name);
                    }}
                    onPointerMove={(event) => {
                      if (!saving && dragging?.view === view && event.currentTarget.hasPointerCapture(event.pointerId)) {
                        move(view, event, dragging.name);
                      }
                    }} onLostPointerCapture={() => { setDragging(null); }}>
                    <image href={urls[view]} width={d.width} height={d.height} />
                    {lines.map(({ name, segment: [[x1, y1], [x2, y2]] }) =>
                      <g key={name} pointerEvents="none">
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#101820" strokeWidth="7" vectorEffect="non-scaling-stroke" />
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={name === "Chest width" ? "#ffca63" : "#57c8ff"} strokeWidth="3" vectorEffect="non-scaling-stroke" />
                        <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 12} fill="white" stroke="#111" strokeWidth="4"
                          textAnchor="middle" paintOrder="stroke" fontSize={Math.max(d.width, d.height) / 40}>{name}</text>
                      </g>)}
                    {names[view].map((name) => {
                      const point = edits[view][name] ?? d.landmarks[name].used;
                      if (!point) return null;
                      return <g key={name}>
                        <circle data-point={name} cx={point[0]} cy={point[1]} r={Math.max(d.width, d.height) / 45}
                          fill="#55e6a5" tabIndex={0} aria-label={name.replaceAll("-", " ")}
                          onKeyDown={(event) => {
                            const offsets: Record<string, Point> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
                            const offset = offsets[event.key];
                            if (!offset || saving) return;
                            event.preventDefault();
                            const step = event.shiftKey ? 10 : 1;
                            place(view, name, point[0] + offset[0] * step, point[1] + offset[1] * step);
                          }} stroke="#111" strokeWidth="4" style={{ touchAction: "none", cursor: "grab" }} />
                        <text x={point[0] + 16} y={point[1] - 16} fill="white" stroke="#111" strokeWidth="4"
                          paintOrder="stroke" fontSize={Math.max(d.width, d.height) / 40} pointerEvents="none">{name}</text>
                      </g>;
                    })}
                  </svg>
            );
          })() : <p className="muted">{file.name}</p>}
        </div>;
      })}
    </div>
    <button type="button" className="button button-secondary keypoint-close" disabled={saving} onClick={onClose}>Close review</button>
  </section>;
}
