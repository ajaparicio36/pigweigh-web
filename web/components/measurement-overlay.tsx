"use client";

import { useEffect, useState } from "react";

import { isDiagnostic, type Point, type PointCorrections } from "@/lib/measurement-diagnostics";

export function MeasurementOverlay({ file, data, view, corrections, onMove }: { file: File; data: unknown; view: string; corrections?: PointCorrections; onMove?: (name: string, point: Point) => void }): React.JSX.Element | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreview({ file, url }));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [file]);

  if (!isDiagnostic(data) || preview?.file !== file) return null;
  const labels: Record<string, string> = {
    "left-ear-base": "LE", "right-ear-base": "RE", "tail-base": "T",
    "left-chest": "LC", "right-chest": "RC", "spine-midpoint": "M",
    withers: "W", sternum: "S", "front-shoulder-joint": "F", "belly-lowest-part": "B",
  };
  const landmarks = { ...data.landmarks, ...corrections };
  const lines = { ...data.lines };
  if (onMove) {
    if (lines.chest_width) lines.chest_width = [landmarks["left-chest"], landmarks["right-chest"]];
    if (lines.chest_depth) lines.chest_depth = [landmarks.withers, landmarks.sternum];
    if (lines.body_length) {
      const [leftX, leftY] = landmarks["left-ear-base"];
      const [rightX, rightY] = landmarks["right-ear-base"];
      const start: Point = [(leftX + rightX) / 2, (leftY + rightY) / 2];
      const tail = landmarks["tail-base"];
      landmarks["spine-midpoint"] ??= [(start[0] + tail[0]) / 2, (start[1] + tail[1]) / 2];
      if (corrections?.["spine-midpoint"]) {
        delete lines.body_length;
        lines.body_length_front = [start, landmarks["spine-midpoint"]];
        lines.body_length_rear = [landmarks["spine-midpoint"], tail];
      } else {
        lines.body_length = [start, tail];
      }
    }
  }
  const size = data.width / 24;
  return <figure>
    <svg viewBox={`0 0 ${data.width} ${data.height}`} width="100%" role="img" aria-label={`${view} measurement overlay`}>
      <image href={preview.url} width={data.width} height={data.height} />
      <polygon points={data.marker.map((point) => point.join(",")).join(" ")} fill="none" stroke="#ffc849" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      {Object.entries(lines).map(([name, [[x1, y1], [x2, y2]]]) =>
        <line key={name} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#42f5e9" strokeWidth={3} vectorEffect="non-scaling-stroke">
          <title>{name.replaceAll("_", " ")}</title>
        </line>,
      )}
      {Object.entries(landmarks).map(([name, [x, y]]) => {
        const move = ["front-shoulder-joint", "belly-lowest-part"].includes(name) ? undefined : onMove;
        return <g key={name}>
          <title>{name.replaceAll("-", " ")}</title>
          <circle cx={x} cy={y} r={size / 4} fill="#fff" stroke="#222" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {move && <circle cx={x} cy={y} r={size * 0.8} fill="transparent" style={{ touchAction: "none", cursor: "grab" }}
            onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
            onPointerMove={(event) => {
              const target = event.currentTarget;
              const matrix = target.ownerSVGElement?.getScreenCTM();
              if (!matrix || !target.hasPointerCapture(event.pointerId)) return;
              const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
              move(name, [
                Math.max(0, Math.min(data.width - 1, Math.round(point.x))),
                Math.max(0, Math.min(data.height - 1, Math.round(point.y))),
              ]);
            }} />}
          <text pointerEvents="none" x={Math.min(x + size / 2, data.width - size * 1.7)}
            y={Math.max(y - size / 3, size)} fontSize={size} fontWeight={700}
            fill="white" stroke="#222" strokeWidth={size / 7} paintOrder="stroke">
            {labels[name] ?? name}
          </text>
        </g>;
      })}
    </svg>
    <figcaption>{view}. Yellow shows the detected ArUco boundary. {onMove ? "Cyan previews the measurement segments." : "Cyan shows the measured segments."} White dots show pose landmarks.
      <ul>{Object.keys(landmarks).map((name) =>
        <li key={name}><strong>{labels[name] ?? name}</strong> {name.replaceAll("-", " ")}</li>,
      )}</ul>
    </figcaption>
  </figure>;
}
