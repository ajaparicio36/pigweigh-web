"use client";

import { useEffect, useState } from "react";

type Point = [number, number];
type Diagnostic = {
  width: number;
  height: number;
  marker: Point[];
  landmarks: Record<string, Point>;
  lines: Record<string, [Point, Point]>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPoint(value: unknown): value is Point {
  return Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
}

function isDiagnostic(value: unknown): value is Diagnostic {
  return isRecord(value) && typeof value.width === "number" && value.width > 0
    && typeof value.height === "number" && value.height > 0
    && Array.isArray(value.marker) && value.marker.length === 4 && value.marker.every(isPoint)
    && isRecord(value.landmarks) && Object.values(value.landmarks).every(isPoint)
    && isRecord(value.lines) && Object.values(value.lines).every(
      (line) => Array.isArray(line) && line.length === 2 && line.every(isPoint),
    );
}

export function MeasurementOverlay({ file, data, view }: { file: File; data: unknown; view: string }): React.JSX.Element | null {
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const frame = requestAnimationFrame(() => setPreview({ file, url }));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [file]);

  if (!isDiagnostic(data) || preview?.file !== file) return null;
  return <figure>
    <svg viewBox={`0 0 ${data.width} ${data.height}`} width="100%" role="img" aria-label={`${view} measurement overlay`}>
      <image href={preview.url} width={data.width} height={data.height} />
      <polygon points={data.marker.map((point) => point.join(",")).join(" ")} fill="none" stroke="#ffc849" strokeWidth={3} vectorEffect="non-scaling-stroke" />
      {Object.entries(data.lines).map(([name, [[x1, y1], [x2, y2]]]) =>
        <line key={name} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#42f5e9" strokeWidth={3} vectorEffect="non-scaling-stroke">
          <title>{name.replaceAll("_", " ")}</title>
        </line>,
      )}
      {Object.entries(data.landmarks).map(([name, [x, y]]) =>
        <circle key={name} cx={x} cy={y} r={Math.max(data.width, data.height) / 125} fill="#fff" stroke="#222" strokeWidth={2} vectorEffect="non-scaling-stroke">
          <title>{name}</title>
        </circle>,
      )}
    </svg>
    <figcaption>{view}. Yellow shows the detected ArUco boundary. Cyan shows the measured segments. White dots show pose landmarks.</figcaption>
  </figure>;
}
