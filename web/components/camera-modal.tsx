"use client";

import { useEffect, useId, useRef, useState } from "react";
import { CameraSession, cameraErrorMessage, canCaptureVideo, capturePhoto, type TorchState } from "@/lib/camera";
import { GUIDED_MAX_ATTEMPTS, runGuidedCapture } from "@/lib/guided-capture";
import type { GuidedCaptureBinding } from "./photo-input";

type CameraModalProps = {
  view: "top" | "side";
  disabled: boolean;
  onCapture: (file: File) => void;
  onClose: (reason: "close" | "upload") => void;
  guidedCapture?: GuidedCaptureBinding;
};

export function CameraModal({ view, disabled, onCapture, onClose, guidedCapture }: CameraModalProps): React.JSX.Element {
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
    if (!guidedRef.current) return;
    guidedRef.current.abort(); guidedRef.current = null;
    setGuided({ running: false, message: "Guided capture stopped. You can still capture or upload a photo." });
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
    stopGuided();
    capturingRef.current = true; setState("capturing"); setError("");
    try {
      const photo = await capturePhoto(video, view);
      if (session.isClosed) return;
      // The selected File goes straight to the normal queue, even when its later check fails.
      onCapture(photo); dismiss();
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
    const controller = new AbortController(); guidedRef.current = controller;
    setGuided({ running: true, message: "Starting guided photo checks…" });
    const result = await runGuidedCapture({
      view, signal: controller.signal,
      capture: () => {
        if (session.isClosed || !canCaptureVideo(video)) return Promise.reject(new Error("The camera preview stopped. Try manual capture or upload a photo."));
        return capturePhoto(video, view);
      },
      check: (file, signal) => guidedCapture.checkCandidate(view, file, signal),
      onProgress: ({ message }) => {
        if (!session.isClosed && guidedRef.current === controller && !controller.signal.aborted) setGuided({ running: true, message });
      },
    });
    if (session.isClosed || guidedRef.current !== controller || controller.signal.aborted) return;
    if (result.status === "passed") {
      let accepted = false;
      try { accepted = guidedCapture.onAccept(result.candidate); }
      catch { accepted = false; }
      finally { controller.abort(); guidedRef.current = null; }
      if (accepted) { dismiss(); return; }
      setGuided({ running: false, message: "The photo selection changed. Start again or use manual capture." });
      return;
    }
    controller.abort(); guidedRef.current = null;
    setGuided({ running: false, message: result.status === "expired" ? "Guided capture reached its time limit. Try again or use manual capture."
      : result.status === "exhausted" ? `No photo passed after ${GUIDED_MAX_ATTEMPTS} attempts. Try again or use manual capture.`
        : result.status === "failed" ? `${result.message} You can still capture or upload a photo.` : "Guided capture stopped." });
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
  return (
    <dialog ref={dialogRef} className="camera-dialog" aria-labelledby={titleId} aria-describedby={helpId}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <div className="camera-dialog-heading">
        <h2 id={titleId}>Take {label} photo</h2>
        <button type="button" className="text-button" onClick={() => dismiss()} autoFocus>Close<span className="sr-only"> camera</span></button>
      </div>
      <div className="camera-dialog-body">
        <p id={helpId} className="camera-instructions">{view === "top"
          ? "Look straight down from above. Keep the whole pig visible, with the flat marker on its back near the middle of its body. Center the marker in the square guide."
          : "Look straight at the pig’s side. Keep its whole profile visible, with the flat marker on the visible flank. Center the marker in the square guide."}</p>
        <div className="camera-preview" style={{ aspectRatio: videoAspect, width: `min(100%, ${45 * videoAspect}dvh)` }}>
          <video ref={videoRef} autoPlay playsInline muted aria-label={`Live ${label} camera preview`}
            onCanPlay={markReady} onPlaying={markReady} onResize={markReady}
            onWaiting={() => { if (!sessionRef.current?.isClosed && !capturingRef.current) setState("starting"); }}
            onError={() => { if (sessionRef.current?.isClosed) return; guidedRef.current?.abort(); guidedRef.current = null; sessionRef.current?.close(); setTorch("unsupported"); setGuided({ running: false, message: "Guided capture stopped because the preview stopped." }); setState("error"); setError("The live preview could not be shown. Close this window and try again, or upload a photo."); }} />
          {state !== "error" && <div className="camera-guides" aria-hidden="true"><div className="camera-marker-target" /></div>}
        </div>
        <p className="camera-status" role="status">{state === "starting" ? "Starting camera… Allow access if your browser asks." : state === "capturing" ? "Saving photo…" : state === "ready" ? "Keep the marker’s four corners and white margin visible. Hold still, then capture." : "Camera unavailable. You can still upload a photo."}</p>
        {error && <p className="field-error" role="alert">{error} Your selected photos have not changed.</p>}
        <p className="field-help">The guide helps with placement only; it does not detect the pig or marker and will not appear in your photo. Keep the card clear of body landmarks.</p>
        {(guidedCapture || torch !== "unsupported") && <details className="field-help">
          <summary>Optional camera tools</summary>
          {guidedCapture && <div>
            <p>Guided capture repeatedly sends still photos for pig and marker checks, up to five attempts or 30 seconds. Live video stays on your device; checked photos are not retained by the server. Stop at any time.</p>
            <button type="button" className="button button-secondary" disabled={disabled || guided.running || state !== "ready"}
              onClick={() => void startGuided()}>Start guided capture</button>
          </div>}
          {torch !== "unsupported" && <div>
            <button type="button" className="button button-secondary" disabled={disabled || torchPending} onClick={() => void toggleTorch()}>{torchPending ? "Changing camera light…" : turnLightOff ? "Turn camera light off" : "Turn camera light on"}</button>
            {torchMessage && <p role="status">{torchMessage}</p>}
          </div>}
        </details>}
        {guided.running && <div className="field-help"><button type="button" className="button button-secondary" onClick={stopGuided}>Stop guided capture</button></div>}
        {guided.message && <p className="field-help" role="status">{guided.message}</p>}
      </div>
      <div className="camera-actions">
        <button type="button" className="button button-secondary" onClick={() => dismiss("upload")}>Use upload instead</button>
        <button type="button" className="button button-primary" disabled={disabled || state !== "ready"} onClick={() => void takePhoto()}>{state === "capturing" ? "Saving photo…" : "Capture photo"}</button>
      </div>
    </dialog>
  );
}
