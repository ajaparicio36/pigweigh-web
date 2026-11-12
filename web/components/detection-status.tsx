import { useEffect, useState, type ReactNode } from "react";
import type { PosePreview } from "@/lib/api";

export function StatusDot({ tone, active = false, children }: { tone: "good" | "wait" | "bad"; active?: boolean; children: ReactNode }): React.JSX.Element {
  return <span className={`detection-status detection-${tone}${active ? " detection-active" : ""}`}>{children}</span>;
}

export function DetectionStatus({ preview, checking = false, confirmed = false }: { preview: PosePreview | null; checking?: boolean; confirmed?: boolean }): React.JSX.Element {
  const pig = confirmed || !!preview?.box;
  const marker = confirmed || preview?.marker === "Marker found";
  const multiple = preview?.pose.startsWith("Multiple pigs");
  return <div className="detection-list">
    <StatusDot tone={pig ? "good" : preview ? "bad" : "wait"}>
      Pig: {pig ? "Detected" : multiple ? "Multiple pigs" : preview ? "Not detected" : checking ? "Checking" : "Unchecked"}
    </StatusDot>
    <StatusDot tone={marker ? "good" : preview ? "bad" : "wait"}>
      ArUco: {marker ? "Detected" : preview?.marker.startsWith("Show the complete") ? "Not detected" : preview ? "Unusable" : checking ? "Checking" : "Unchecked"}
    </StatusDot>
    {preview && !marker && <small>{preview.marker}</small>}
    {pig && preview?.points.some((point) => !point.clear) && <small>Some keypoints are unclear. Keep the whole pig in frame.</small>}
  </div>;
}


export function ElapsedTime(): React.JSX.Element {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const timer = window.setInterval(() => setSeconds(Math.floor((performance.now() - start) / 1000)), 250);
    return () => window.clearInterval(timer);
  }, []);
  const label = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return <span className="process-elapsed"><span className="sr-only">Elapsed </span>{label}</span>;
}
