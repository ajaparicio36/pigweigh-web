"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { CameraModal } from "@/components/camera-modal";
import { photoValidationError } from "@/lib/camera";

type PhotoInputProps = { view: "top" | "side"; file: File | null; disabled: boolean; onChange: (file: File | null) => void };

export function PhotoInput({ view, file, disabled, onChange }: PhotoInputProps): React.JSX.Element {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraButtonRef = useRef<HTMLButtonElement>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState("");
  const label = view === "top" ? "Top view" : "Side view";
  const closeCamera = useCallback((reason: "close" | "upload"): void => {
    setCameraOpen(false);
    if (reason === "upload") inputRef.current?.focus();
    else cameraButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // Object URLs belong to this selection and are released on replace or unmount.
    const frame = requestAnimationFrame(() => setPreview({ file, url }));
    return () => { cancelAnimationFrame(frame); URL.revokeObjectURL(url); };
  }, [file]);

  return (
    <div className="photo-card">
      <div className="photo-heading"><h3>{label}</h3><span className="photo-state">{file ? "Photo selected" : "Required photo"}</span></div>
      <div className={`photo-preview${file ? " has-photo" : ""}`}>
        {file && preview?.file === file ? (
          <Image src={preview.url} alt={`${label} photo selected for review`} width={640} height={440} unoptimized />
        ) : (
          <div className="photo-empty">
            <span className="view-label">{view === "top" ? "From above" : "From the side"}</span>
            <p>{view === "top" ? "Photograph the whole pig straight down from above." : "Photograph the whole pig straight on from the side."}</p>
          </div>
        )}
      </div>
      <div className="photo-controls">
        <button ref={cameraButtonRef} type="button" className="button button-secondary photo-camera-button" disabled={disabled}
          aria-haspopup="dialog" onClick={() => setCameraOpen(true)}>Take photo<span className="sr-only"> for {label.toLowerCase()}</span></button>
        <label className="field-label" htmlFor={id}>{file ? `Or upload a replacement ${label.toLowerCase()} photo` : `Or upload a ${label.toLowerCase()} photo`}</label>
        <input ref={inputRef} id={id} name={`${view}_image`} type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled}
          aria-invalid={Boolean(error)} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`}
          onChange={(event) => {
            const selected = event.target.files?.[0];
            if (!selected) return;
            const validationError = photoValidationError(selected);
            if (validationError) { setError(validationError); event.target.value = ""; return; }
            setError(""); onChange(selected);
          }} />
        <p id={`${id}-help`} className="field-help">{view === "top" ? "Attach the flat ArUco card on the pig’s back." : "Attach the flat ArUco card on the pig’s visible flank."} JPEG, PNG or WebP. Up to 10 MB.</p>
        {error && <p id={`${id}-error`} className="field-error" role="alert">{error}{file ? " Your previous photo is still selected." : ""}</p>}
        {file && <div className="selected-file"><span title={file.name}>{file.name}</span><button className="text-button" type="button" disabled={disabled} onClick={() => { onChange(null); setError(""); if (inputRef.current) inputRef.current.value = ""; }}>Remove<span className="sr-only"> {label.toLowerCase()} photo</span></button></div>}
      </div>
      {cameraOpen && <CameraModal view={view} disabled={disabled} onClose={closeCamera} onCapture={(photo) => {
        setError("");
        if (inputRef.current) inputRef.current.value = "";
        onChange(photo);
      }} />}
    </div>
  );
}
