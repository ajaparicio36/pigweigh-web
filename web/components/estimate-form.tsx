"use client";

import { useEffect, useState } from "react";
import { isReadiness, request, type LoadState, type Readiness } from "@/lib/api";
import { RepeatTest } from "./repeat-test";
import { StatusDot } from "./detection-status";
import { MonthlyPriceTrend } from "./monthly-price-trend";

export function EstimateForm(): React.JSX.Element {
  const [readiness, setReadiness] = useState<LoadState<Readiness>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function checkReadiness(): Promise<void> {
      try {
        const data = await request("/inference/readiness", isReadiness, { signal: controller.signal });
        if (!controller.signal.aborted) setReadiness({ status: "ready", data });
      } catch (error: unknown) {
        if (!controller.signal.aborted) setReadiness({ status: "error", message: String(error) });
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(() => void checkReadiness(), 15_000);
      }
    }
    void checkReadiness();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  const unavailable = readiness.status === "ready" && !readiness.data.ready;

  return (
    <div className="flow-stack">
      <section className="readiness-panel" aria-label="Photo analysis status">
        <p role="status"><StatusDot tone={readiness.status === "loading" ? "wait" : readiness.status === "error" || unavailable ? "bad" : "good"}>
          <strong>{readiness.status === "loading" ? "Checking photo analysis…" :
            readiness.status === "error" ? "Photo analysis server unreachable" :
            unavailable ? "Photo analysis unavailable" : "Photo analysis ready"}</strong>
        </StatusDot></p>
        {unavailable && readiness.data.blockers.length > 0 && <details>
          <summary>View details</summary>
          <ul>{readiness.data.blockers.map((blocker, index) => <li key={`${blocker.code}-${index}`}>{blocker.message}</li>)}</ul>
        </details>}
      </section>
      <MonthlyPriceTrend />
      <RepeatTest estimationReady={readiness.status === "ready" && readiness.data.ready} />
    </div>
  );
}
