"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CameraSession, cameraErrorMessage, canCaptureVideo, capturePhoto, type TorchState } from "@/lib/camera";
import { previewPhoto, inferenceIssue, errorMessage, type PosePreview } from "@/lib/api";
import { DetectionStatus, ElapsedTime, StatusDot } from "./detection-status";
import { runGuidedCapture } from "@/lib/guided-capture";
import type { GuidedCaptureBinding } from "./photo-input";

type CameraModalProps = {
  view: "top" | "side";
  disabled: boolean;
  onCapture: (file: File) => void;
  onClose: (reason: "close" | "upload") => void;
  guidedCapture?: Omit<GuidedCaptureBinding, "onAccept"> & { onAccept: (candidate: Parameters<GuidedCaptureBinding["onAccept"]>[0]) => boolean | Promise<boolean> };
  keepOpen?: boolean;
  batchProgress?: { saved: number; total: number };
  captureError?: string;
  captureBusy?: boolean;
};

export function CameraModal({ view, disabled, onCapture, onClose, guidedCapture, keepOpen = false, batchProgress, captureError, captureBusy = false }: CameraModalProps): React.JSX.Element {
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const dismissedRef = useRef(false);
  const capturingRef = useRef(false);
  const guidedRef = useRef<AbortController | null>(null);
  const lightPendingRef = useRef(false);
  const [state, setState] = useState<"starting" | "ready" | "capturing" | "error">("starting");
  const [error, setError] = useState("");
  const [videoAspect, setVideoAspect] = useState(4 / 3);
  const [guided, setGuided] = useState<{ running: boolean; message: string }>({ running: false, message: "" });
  const [torch, setTorch] = useState<TorchState>("unsupported");
  const [torchRequested, setTorchRequested] = useState(false);
  const [torchPending, setTorchPending] = useState(false);
  const [torchMessage, setTorchMessage] = useState("");
  const [previewEnabled, setPreviewEnabled] = useState(true);
  const [preview, setPreview] = useState<PosePreview | null>(null);
  const [guidedDetection, setGuidedDetection] = useState<{
    preview: PosePreview | null; confirmed?: boolean; checking?: boolean; saved?: boolean; issue?: string; hint?: string;
  } | null>(null);
  const previewRef = useRef<AbortController | null>(null);
  const previewActive = previewEnabled && state === "ready" && !disabled && !guided.running;

  useEffect(() => {
    if (!previewActive) return;
    const controller = new AbortController();
    previewRef.current = controller;
    const { signal } = controller;
    let next: ReturnType<typeof setTimeout>;
    let stale: ReturnType<typeof setTimeout>;
    async function sample(): Promise<void> {
      const started = performance.now();
      const video = videoRef.current;
      if (signal.aborted || !video || sessionRef.current?.isClosed) return;
      try {
        const image = await capturePhoto(video, view, 960);
        if (signal.aborted) return;
        const frame = await previewPhoto(view, image, signal);
        if (signal.aborted) return;
        clearTimeout(stale);
        const age = performance.now() - started;
        setPreview(age < 3000 ? frame : null);
        stale = setTimeout(() => setPreview(null), Math.max(0, 3000 - age));
      } catch {
        if (!signal.aborted) setPreview(null);
      } finally {
        if (!signal.aborted) next = setTimeout(() => void sample(), Math.max(100, 500 - (performance.now() - started)));
      }
    }
    next = setTimeout(() => void sample(), 0);
    return () => {
      controller.abort();
      clearTimeout(next);
      clearTimeout(stale);
      if (previewRef.current === controller) previewRef.current = null;
    };
  }, [previewActive, view, videoAspect]);

  const label = view === "top" ? "top view" : "side view";

  useEffect(() => {
    if (disabled) { onClose("close"); return; }
    const dialog = dialogRef.current;
    const video = videoRef.current;
    const session = new CameraSession();
    sessionRef.current = session;
    dismissedRef.current = false;
    dialog?.showModal();

    function dismissWhenHidden(): void {
      if (document.visibilityState === "hidden") {
        dismissedRef.current = true;
        guidedRef.current?.abort(); guidedRef.current = null;
        session.close(); dialog?.close(); onClose("close");
      }
    }
    async function start(): Promise<void> {
      try {
        if (!window.isSecureContext) throw new Error("Open PigWeigh over HTTPS to use the camera, or upload a photo instead.");
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("This browser does not support camera capture. Upload a photo instead.");
        const stream = await session.open(() => navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        }));
        if (!stream || !video) return;
        for (const track of stream.getVideoTracks()) {
          track.addEventListener("ended", () => {
            if (session.isClosed) return;
            guidedRef.current?.abort(); guidedRef.current = null;
            session.close(); setTorch("unsupported"); setGuided({ running: false, message: "Guided capture stopped because the camera stopped." }); setState("error");
            setError("The camera stopped. Close this window and try again, or upload a photo.");
          }, { once: true });
        }
        setTorch(session.torchState());
        video.srcObject = stream;
        await video.play();
      } catch (failure: unknown) {
        if (session.isClosed) return;
        guidedRef.current?.abort(); guidedRef.current = null;
        session.close(); setTorch("unsupported"); setState("error");
        setError(failure instanceof Error && failure.name === "Error" ? failure.message : cameraErrorMessage(failure));
      }
    }
    document.addEventListener("visibilitychange", dismissWhenHidden);
    void start();
    return () => {
      guidedRef.current?.abort(); guidedRef.current = null;
      session.close();
      document.removeEventListener("visibilitychange", dismissWhenHidden);
      if (video) video.srcObject = null;
      dialog?.close();
    };
  }, [disabled, onClose]);

  function stopGuided(): void {
    guidedRef.current?.abort(); guidedRef.current = null;
    setGuidedDetection(null);
    setGuided({ running: false, message: "" });
  }
  function dismiss(reason: "close" | "upload" = "close"): void {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    guidedRef.current?.abort(); guidedRef.current = null;
    sessionRef.current?.close(); dialogRef.current?.close(); onClose(reason);
  }
  function markReady(): void {
    const video = videoRef.current;
    if (!sessionRef.current?.isClosed && video && canCaptureVideo(video) && !capturingRef.current) {
      setVideoAspect(video.videoWidth / video.videoHeight); setState("ready");
    }
  }
  async function takePhoto(): Promise<void> {
    const session = sessionRef.current;
    const video = videoRef.current;
    if (disabled || !session || session.isClosed || !video || state !== "ready" || capturingRef.current) return;
    previewRef.current?.abort(); setPreview(null);
    stopGuided();
    capturingRef.current = true; setState("capturing"); setError("");
    try {
      const photo = await capturePhoto(video, view);
      if (session.isClosed) return;
      // The selected File goes straight to the normal queue, even when its later check fails.
      onCapture(photo);
      if (keepOpen) setState("ready");
      else dismiss();
    } catch (failure: unknown) {
      if (session.isClosed) return;
      setError(failure instanceof Error ? failure.message : "The photo could not be saved. Try again or upload a photo.");
      setState(canCaptureVideo(video) ? "ready" : "starting");
    } finally { capturingRef.current = false; }
  }
  async function startGuided(): Promise<void> {
    const session = sessionRef.current;
    const video = videoRef.current;
    if (!guidedCapture || disabled || !session || session.isClosed || !video || state !== "ready" || guidedRef.current || capturingRef.current) return;
    previewRef.current?.abort(); setPreview(null);
    const controller = new AbortController(); guidedRef.current = controller;
    setGuidedDetection(null);
    setGuided({ running: true, message: "" });
    try {
      while (!controller.signal.aborted && !session.isClosed) {
        const result = await runGuidedCapture({
          view, signal: controller.signal,
          capture: () => {
            if (session.isClosed || !canCaptureVideo(video)) return Promise.reject(new Error("The camera preview stopped."));
            setGuidedDetection(null);
            return capturePhoto(video, view);
          },
          check: async (file, signal) => {
            setGuidedDetection({ preview: null, checking: true });
            const check = await guidedCapture.checkCandidate(view, file, signal);
            if (signal.aborted || check.status === "cancelled") return check;
            if (check.status === "passed") {
              setGuidedDetection({ preview: null, confirmed: true });
            } else if (check.kind === "rejected") {
              try {
                const frame = await previewPhoto(view, file, signal);
                if (!signal.aborted) setGuidedDetection({ preview: frame, hint: check.message });
              } catch (failure) {
                if (!signal.aborted) setGuidedDetection({ preview: null, issue: inferenceIssue(failure) });
              }
            } else {
              const issue = check.kind === "busy" ? "Server busy" :
                check.kind === "connection" ? "Server unreachable" : "Inference server unavailable";
              setGuidedDetection({ preview: null, issue });
            }
            return check;
          },
        });
        if (controller.signal.aborted || session.isClosed) return;
        if (result.status !== "passed") {
          setGuided({ running: false, message: result.status === "failed" ? result.message : "Guided capture stopped." });
          return;
        }
        const accepted = await guidedCapture.onAccept(result.candidate);
        if (controller.signal.aborted || session.isClosed) return;
        if (!accepted) {
          setGuided({ running: false, message: "The photo could not be saved. Try again." });
          return;
        }
        if (!keepOpen) { dismiss(); return; }
        setGuidedDetection({ preview: null, confirmed: true, saved: true });
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
      }
    } catch (failure) {
      if (!controller.signal.aborted && !session.isClosed) setGuided({ running: false, message: errorMessage(failure) });
    } finally {
      controller.abort();
      if (guidedRef.current === controller) guidedRef.current = null;
    }
  }
  async function toggleTorch(): Promise<void> {
    const session = sessionRef.current;
    if (!session || session.isClosed || torch === "unsupported" || lightPendingRef.current) return;
    const next = torch === "on" ? false : torch === "off" ? true : !torchRequested;
    lightPendingRef.current = true; setTorchPending(true); setTorchMessage("");
    try {
      const actual = await session.setTorch(next);
      if (session.isClosed || sessionRef.current !== session) return;
      setTorchRequested(next); setTorch(actual);
      if (actual === "unconfirmed") setTorchMessage("The browser could not confirm the camera light setting.");
      else if (actual !== "unsupported" && (actual === "on") !== next) setTorchMessage("The camera did not confirm the requested light setting.");
    } catch {
      if (session.isClosed || sessionRef.current !== session) return;
      setTorch(session.torchState()); setTorchMessage("The camera light setting could not be changed.");
    } finally {
      lightPendingRef.current = false;
      if (!session.isClosed && sessionRef.current === session) setTorchPending(false);
    }
  }
  const turnLightOff = torch === "on" || (torch === "unconfirmed" && torchRequested);
  const stage = error ? "Camera unavailable" :
    guidedDetection?.issue ?? (guided.message ? "Capture paused" :
      guidedDetection?.checking ? "Checking photo…" :
      guidedDetection?.saved ? "Photo saved" :
      guidedDetection?.confirmed || captureBusy || state === "capturing" ? "Saving photo…" :
      guidedDetection?.preview ? "Retaking photo…" :
      guided.running ? "Taking photo…" :
      state === "starting" ? "Starting camera…" : "Ready to capture");
  const tone = error || guidedDetection?.issue || guided.message ? "bad" :
    (guided.running && !guidedDetection?.saved) || captureBusy || state !== "ready" ? "wait" : "good";
  return (
    <dialog ref={dialogRef} className="camera-dialog" aria-labelledby={titleId} aria-describedby={helpId}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <div className="camera-dialog-heading">
        <h2 id={titleId}>{keepOpen ? `Capture ${label} batch` : `Take ${label} photo`}</h2>
        <button type="button" className="text-button" onClick={() => dismiss()} autoFocus>Close<span className="sr-only"> camera</span></button>
      </div>
      <div className="camera-dialog-body">
        <p id={helpId} className="camera-instructions">{view === "top"
          ? "Hold the phone directly above the pig and wait for it to straighten. Keep both ear bases and the tail base visible, with the flat marker on its back near the middle of its body. Center the marker in the square guide."
          : "Look straight at the pig’s side. Keep the withers and underside of the chest visible, with the flat marker on the visible flank. Center the marker in the square guide."}</p>
        <details className="marker-placement-help">
          <summary>Where to place the marker</summary>
          <p>{view === "top" ? "Place the card flat on the middle of the pig’s back. Hold the phone directly above it."
            : "Place the card flat on the side facing you. Hold the phone level with the pig’s side."}</p>
        </details>
        <div className="camera-preview-group">
          <div className="camera-stage">
            <div className="camera-stage-label">
              <span role="status"><StatusDot tone={tone} active={tone === "wait"}>{stage}</StatusDot></span>
              {tone === "wait" && <ElapsedTime key={stage} />}
            </div>
            {batchProgress && <span className="camera-stage-count" role="status">
              <span className="sr-only">Photos saved </span>{batchProgress.saved}/{batchProgress.total}
            </span>}
          </div>
          <div className="camera-preview" style={{ aspectRatio: videoAspect, width: `min(100%, ${45 * videoAspect}dvh)` }}>
            <video ref={videoRef} autoPlay playsInline muted aria-label={`Live ${label} camera preview`}
              onCanPlay={markReady} onPlaying={markReady} onResize={markReady}
              onWaiting={() => { if (!sessionRef.current?.isClosed && !capturingRef.current) setState("starting"); }}
              onError={() => { if (sessionRef.current?.isClosed) return; guidedRef.current?.abort(); guidedRef.current = null; sessionRef.current?.close(); setTorch("unsupported"); setGuided({ running: false, message: "Guided capture stopped because the preview stopped." }); setState("error"); setError("The live preview could not be shown. Close this window and try again, or upload a photo."); }} />
            {previewActive && preview && Math.abs(preview.width / preview.height - videoAspect) < 0.02 &&
              <svg aria-hidden="true" viewBox={`0 0 ${preview.width} ${preview.height}`}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }}>
                {preview.box && <rect x={preview.box[0]} y={preview.box[1]} width={Math.max(0, preview.box[2] - preview.box[0])}
                  height={Math.max(0, preview.box[3] - preview.box[1])} fill="none" stroke="#55e6a5" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
                {preview.points.filter((p) => p.x >= 0 && p.y >= 0 && p.x < preview.width && p.y < preview.height).map((p) =>
                  <g key={p.name} fill={p.clear ? "#55e6a5" : "#ffca63"}>
                    <circle cx={p.x} cy={p.y} r={preview.width * 0.008} stroke="#111" />
                    <text x={p.x + 10} y={p.y - 10} fontSize={Math.max(16, preview.width * 0.022)}
                      stroke="#111" strokeWidth="3" paintOrder="stroke">{p.name.replaceAll("-", " ")}</text>
                  </g>)}
              </svg>}
            {state !== "error" && <div className="camera-guides" aria-hidden="true"><div className="camera-marker-target" /></div>}
          </div>
        </div>
        {(error || captureError || (guided.message && !guidedDetection?.issue)) &&
          <p className="field-error" role="alert">{error || captureError || guided.message}</p>}
        {guidedDetection && !guidedDetection.issue && <DetectionStatus {...guidedDetection} />}
        {guidedDetection?.hint && <p className="camera-status">{guidedDetection.hint}</p>}
        <div className="camera-tool-row">
          <button type="button" className="button button-secondary" aria-pressed={previewEnabled}
            disabled={disabled || state !== "ready" || guided.running}
            onClick={() => { setPreview(null); setPreviewEnabled(!previewEnabled); }}>
            {previewEnabled ? "Hide live pose" : "Show live pose"}
          </button>
          <button type="button" className="button button-secondary" onClick={() => dismiss("upload")}>Use upload instead</button>
          {torch !== "unsupported" && <button type="button" className="button button-secondary"
            disabled={disabled || torchPending} onClick={() => void toggleTorch()}>
            {torchPending ? "Changing light…" : turnLightOff ? "Light off" : "Light on"}
          </button>}
        </div>
        {torchMessage && <p role="status">{torchMessage}</p>}
      </div>
      <div className="camera-actions">
        {guidedCapture && <button type="button" className="button button-secondary"
          disabled={disabled || (!guided.running && (captureBusy || state !== "ready"))}
          onClick={() => { if (guided.running) stopGuided(); else void startGuided(); }}>
          {guided.running ? "Stop guided capture" : "Guided Capture"}
        </button>}
        <button type="button" className="button button-primary" disabled={disabled || captureBusy || state !== "ready"} onClick={() => void takePhoto()}>{state === "capturing" ? "Saving photo…" : "Manual Capture"}</button>
      </div>
    </dialog>
  );
}
