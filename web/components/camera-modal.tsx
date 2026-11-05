"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ApiError, errorMessage, validatePhoto } from "@/lib/api";
import { CameraSession, cameraErrorMessage, canCaptureVideo, capturePhoto } from "@/lib/camera";

type TorchConstraint = MediaTrackConstraintSet & { torch: boolean };

type CameraModalProps = {
  view: "top" | "side";
  disabled: boolean;
  onCapture: (file: File) => void;
  onClose: (reason: "close" | "upload") => void;
};

export function CameraModal({ view, disabled, onCapture, onClose }: CameraModalProps): React.JSX.Element {
  const titleId = useId();
  const helpId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const sessionRef = useRef<CameraSession | null>(null);
  const dismissedRef = useRef(false);
  const autoRef = useRef<AbortController | null>(null);
  const [autoStatus, setAutoStatus] = useState("");
  const capturingRef = useRef(false);
  const [state, setState] = useState<"starting" | "ready" | "capturing" | "error">("starting");
  const [error, setError] = useState("");
  const [torchTrack, setTorchTrack] = useState<MediaStreamTrack | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchBusy, setTorchBusy] = useState(false);
  const [torchError, setTorchError] = useState("");
  const [videoAspect, setVideoAspect] = useState(4 / 3);
  const label = view === "top" ? "top view" : "side view";

  useEffect(() => {
    if (disabled) {
      onClose("close");
      return;
    }
    const dialog = dialogRef.current;
    const video = videoRef.current;
    const session = new CameraSession();
    sessionRef.current = session;
    dismissedRef.current = false;
    dialog?.showModal();

    function dismissWhenHidden(): void {
      if (document.visibilityState === "hidden") {
        dismissedRef.current = true;
        autoRef.current?.abort();
        session.close();
        dialog?.close();
        onClose("close");
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
            autoRef.current?.abort();
            session.close();
            setState("error");
            setError("The camera stopped. Close this window and try again, or upload a photo.");
          }, { once: true });
        }
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.();
        if (capabilities && "torch" in capabilities && capabilities.torch === true) setTorchTrack(track);
        video.srcObject = stream;
        await video.play();
      } catch (failure: unknown) {
        if (session.isClosed) return;
        session.close();
        setState("error");
        setError(failure instanceof Error && failure.name === "Error" ? failure.message : cameraErrorMessage(failure));
      }
    }

    document.addEventListener("visibilitychange", dismissWhenHidden);
    void start();
    return () => {
      autoRef.current?.abort();
      session.close();
      document.removeEventListener("visibilitychange", dismissWhenHidden);
      if (video) video.srcObject = null;
      dialog?.close();
    };
  }, [disabled, onClose]);

  function dismiss(reason: "close" | "upload" = "close"): void {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    autoRef.current?.abort();
    sessionRef.current?.close();
    dialogRef.current?.close();
    onClose(reason);
  }

  function markReady(): void {
    const video = videoRef.current;
    if (!sessionRef.current?.isClosed && video && canCaptureVideo(video) && !capturingRef.current) {
      setVideoAspect(video.videoWidth / video.videoHeight);
      setState("ready");
    }
  }

  async function toggleTorch(): Promise<void> {
    const session = sessionRef.current;
    if (!torchTrack || !session || session.isClosed || torchBusy || capturingRef.current || autoRef.current) return;
    const torch = !torchOn;
    const constraint: TorchConstraint = { torch };
    setTorchBusy(true);
    setTorchError("");
    try {
      await torchTrack.applyConstraints({ ...torchTrack.getConstraints(), advanced: [constraint] });
      if (session.isClosed) return;
      const settings = torchTrack.getSettings();
      if ("torch" in settings && settings.torch !== torch) throw new Error("Camera light did not change.");
      setTorchOn(torch);
    } catch {
      if (!session.isClosed) setTorchError("The browser could not change the camera light. You can still capture a photo.");
    } finally {
      if (!session.isClosed) setTorchBusy(false);
    }
  }

  function stopAuto(): void {
    autoRef.current?.abort();
    autoRef.current = null;
    setAutoStatus("");
  }

  async function autoCapture(): Promise<void> {
    const video = videoRef.current;
    const session = sessionRef.current;
    if (!video || !session || session.isClosed || torchBusy || capturingRef.current || autoRef.current) return;
    const controller = new AbortController();
    autoRef.current = controller;
    const { signal } = controller;
    setError("");
    setAutoStatus("Looking for the pig and ArUco marker…");
    try {
      while (!signal.aborted && !session.isClosed) {
        if (canCaptureVideo(video)) {
          const photo = await capturePhoto(video, view);
          if (signal.aborted || session.isClosed) return;
          try {
            await validatePhoto(view, photo, signal);
            if (signal.aborted || session.isClosed) return;
            onCapture(photo);
            dismiss();
            return;
          } catch (failure: unknown) {
            if (signal.aborted || session.isClosed) return;
            if (!(failure instanceof ApiError) || ![422, 429].includes(failure.status)) throw failure;
            setAutoStatus(failure.message);
          }
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 850));
      }
    } catch (failure: unknown) {
      if (!signal.aborted && !session.isClosed) setError(errorMessage(failure));
    } finally {
      if (autoRef.current === controller) {
        autoRef.current = null;
        setAutoStatus("");
      }
    }
  }

  async function takePhoto(): Promise<void> {
    const session = sessionRef.current;
    const video = videoRef.current;
    if (disabled || !session || session.isClosed || !video || state !== "ready" || torchBusy || capturingRef.current) return;
    stopAuto();
    capturingRef.current = true;
    const controller = new AbortController();
    autoRef.current = controller;
    setState("capturing");
    setError("");
    try {
      const photo = await capturePhoto(video, view);
      if (session.isClosed) return;
      await validatePhoto(view, photo, controller.signal);
      if (controller.signal.aborted || session.isClosed) return;
      onCapture(photo);
      dismiss();
    } catch (failure: unknown) {
      if (session.isClosed) return;
      setError(failure instanceof Error ? failure.message : "The photo could not be saved. Try again or upload a photo.");
      setState(canCaptureVideo(video) ? "ready" : "starting");
    } finally {
      if (autoRef.current === controller) autoRef.current = null;
      capturingRef.current = false;
    }
  }

  return (
    <dialog ref={dialogRef} className="camera-dialog" aria-labelledby={titleId} aria-describedby={helpId}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}>
      <div className="camera-dialog-heading">
        <h2 id={titleId}>Take {label} photo</h2>
        <button type="button" className="text-button" onClick={() => dismiss()} autoFocus>Close<span className="sr-only"> camera</span></button>
      </div>
      <div className="camera-dialog-body">
        <p id={helpId} className="camera-instructions">{view === "top"
          ? "Look straight down from above. Keep the whole pig inside the dashed frame, with the flat marker on its back near the middle of its body."
          : "Look straight at the pig’s side. Keep its whole profile inside the dashed frame, with the flat marker on the visible flank."}</p>
        <div className={`camera-preview camera-preview-${view}`} style={{ aspectRatio: videoAspect, width: `min(100%, ${45 * videoAspect}dvh)` }}>
          <video ref={videoRef} autoPlay playsInline muted aria-label={`Live ${label} camera preview`}
            onCanPlay={markReady} onPlaying={markReady} onResize={markReady}
            onWaiting={() => { if (!sessionRef.current?.isClosed && !capturingRef.current) setState("starting"); }}
            onError={() => { if (sessionRef.current?.isClosed) return; autoRef.current?.abort(); sessionRef.current?.close(); setState("error"); setError("The live preview could not be shown. Close this window and try again, or upload a photo."); }} />
          {state !== "error" && <div className="camera-guides" aria-hidden="true">
            <div className="camera-pig-frame"><span>{view === "top" ? "Whole pig · from above" : "Whole pig · side profile"}</span></div>
            <div className="camera-marker-target"><span>ArUco here</span></div>
          </div>}
        </div>
        <p className="camera-status" role="status">{autoStatus || (state === "starting" ? "Starting camera… Allow access if your browser asks." : state === "capturing" ? "Checking photo…" : state === "ready" ? "Keep the marker’s four corners and white margin visible. Hold still, then capture." : "Camera unavailable. You can still upload a photo.")}</p>
        {torchTrack && state !== "error" && <button type="button" className="button button-secondary"
          aria-pressed={torchOn} disabled={disabled || state !== "ready" || torchBusy || Boolean(autoStatus)}
          onClick={() => void toggleTorch()}>Camera light</button>}
        {torchError && <p className="field-error" role="alert">{torchError}</p>}
        {error && <p className="field-error" role="alert">{error} Your selected photos have not changed.</p>}
        <p className="field-help">Guides help with placement only; they do not detect the pig or marker and will not appear in your photo. Keep the card clear of body landmarks.</p>
      </div>
      <div className="camera-actions">
        <button type="button" className="button button-secondary" onClick={() => dismiss("upload")}>Use upload instead</button>
        <button type="button" className="button button-secondary" disabled={disabled || torchBusy || (!autoStatus && state !== "ready")}
          onClick={() => autoStatus ? stopAuto() : void autoCapture()}>{autoStatus ? "Stop auto" : "Auto capture"}</button>
        <button type="button" className="button button-primary" disabled={disabled || torchBusy || state !== "ready"} onClick={() => void takePhoto()}>{state === "capturing" ? "Checking photo…" : "Capture photo"}</button>
      </div>
    </dialog>
  );
}
