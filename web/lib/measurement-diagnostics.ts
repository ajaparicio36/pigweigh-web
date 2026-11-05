export type Point = [number, number];
export type Diagnostic = {
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

export function isDiagnostic(value: unknown): value is Diagnostic {
  return isRecord(value) && typeof value.width === "number" && value.width > 0
    && typeof value.height === "number" && value.height > 0
    && Array.isArray(value.marker) && value.marker.length === 4 && value.marker.every(isPoint)
    && isRecord(value.landmarks) && Object.values(value.landmarks).every(isPoint)
    && isRecord(value.lines) && Object.values(value.lines).every(
      (line) => Array.isArray(line) && line.length === 2 && line.every(isPoint),
    );
}


export type PointCorrections = Record<string, Point>;

export function isPoseReview(value: unknown): value is {
  diagnostics: { top: Diagnostic; side: Diagnostic };
} {
  return isRecord(value) && value.status === "review" && isRecord(value.diagnostics)
    && isDiagnostic(value.diagnostics.top) && isDiagnostic(value.diagnostics.side);
}
