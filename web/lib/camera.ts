export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export function photoValidationError(photo: Pick<Blob, "size" | "type">): string | null {
  if (photo.size > MAX_PHOTO_BYTES) return "This photo is too large. Choose one under 10 MB.";
  if (photo.type && !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) return "Choose a JPEG, PNG, or WebP photo.";
  return null;
}

export function cameraErrorMessage(error: unknown): string {
  const name = error !== null && typeof error === "object" && "name" in error ? error.name : "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Camera access was not allowed. Allow camera access in your browser settings and try again, or upload a photo.";
    case "NotFoundError":
    case "DevicesNotFoundError":
      return "No camera was found on this device. Connect a camera and try again, or upload a photo.";
    case "NotReadableError":
    case "TrackStartError":
      return "The camera could not start. Close other apps using it and try again, or upload a photo.";
    default:
      return "The camera could not start. Close this window and try again, or upload a photo.";
  }
}

export type TorchState = "unsupported" | "off" | "on" | "unconfirmed";
function torchFlag(value: unknown): boolean | null {
  if (typeof value !== "object" || value === null || !("torch" in value)) return null;
  return typeof value.torch === "boolean" ? value.torch : null;
}
function trackEnded(track: MediaStreamTrack): boolean { return track.readyState === "ended"; }
function supportedTorch(track: MediaStreamTrack): boolean {
  try { return typeof track.getCapabilities === "function" && torchFlag(track.getCapabilities()) === true; }
  catch { return false; }
}
/** Owns a single request, including a stream that arrives after its modal closes. */
export class CameraSession {
  private stream: MediaStream | null = null;
  private closed = false;

  get isClosed(): boolean { return this.closed; }

  async open(request: () => Promise<MediaStream>): Promise<MediaStream | null> {
    const stream = await request();
    if (this.closed) {
      for (const track of stream.getTracks()) track.stop();
      return null;
    }
    this.stream = stream;
    return stream;
  }

  torchState(): TorchState {
    const track = this.stream?.getVideoTracks()[0];
    if (this.closed || !track || trackEnded(track) || !supportedTorch(track)) return "unsupported";
    try {
      const value = torchFlag(track.getSettings());
      return value === null ? "unconfirmed" : value ? "on" : "off";
    } catch { return "unconfirmed"; }
  }

  async setTorch(enabled: boolean): Promise<TorchState> {
    const track = this.stream?.getVideoTracks()[0];
    if (this.closed || !track || trackEnded(track) || !supportedTorch(track)) return "unsupported";
    const constraint: MediaTrackConstraintSet & { torch: boolean } = { torch: enabled };
    await track.applyConstraints({ advanced: [constraint] });
    if (this.closed || trackEnded(track) || this.stream?.getVideoTracks()[0] !== track) return "unsupported";
    return this.torchState();
  }

  close(): void {
    this.closed = true;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}

export function canCaptureVideo(video: Pick<HTMLVideoElement, "videoWidth" | "videoHeight" | "readyState" | "paused">): boolean {
  return video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2 && !video.paused;
}

export async function capturePhoto(video: HTMLVideoElement, view: "top" | "side"): Promise<File> {
  if (!canCaptureVideo(video)) throw new Error("Wait for the live preview before taking a photo.");
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser could not save the photo. Upload a photo instead.");
  // Draw only the original video pixels; the on-screen guides are separate DOM.
  context.drawImage(video, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => result ? resolve(result) : reject(new Error("The photo could not be saved. Try again or upload a photo.")), "image/jpeg", 0.92);
  });
  const validationError = photoValidationError(blob);
  if (validationError) throw new Error(validationError);
  return new File([blob], `pigweigh-${view}-${Date.now()}.jpg`, { type: blob.type });
}
