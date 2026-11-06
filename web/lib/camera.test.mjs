import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const compiled = mkdtempSync(path.join(tmpdir(), "pigweigh-camera-tests-"));
const require = createRequire(import.meta.url);
try {
  execFileSync(process.execPath, [path.join(project, "node_modules/typescript/bin/tsc"), "lib/camera.ts", "--outDir", compiled, "--target", "es2020", "--module", "commonjs", "--strict", "--skipLibCheck"], { cwd: project, stdio: "pipe" });
} catch (error) {
  rmSync(compiled, { recursive: true, force: true });
  throw error;
}
after(() => rmSync(compiled, { recursive: true, force: true }));
const { CameraSession, canCaptureVideo, capturePhoto, photoValidationError, cameraErrorMessage, MAX_PHOTO_BYTES } = require(path.join(compiled, "camera.js"));

test("closing a camera session stops every track once", async () => {
  const stopped = [];
  const stream = { getTracks: () => [{ stop: () => stopped.push("video") }, { stop: () => stopped.push("other") }] };
  const session = new CameraSession();
  assert.equal(await session.open(async () => stream), stream);
  session.close();
  session.close();
  assert.equal(session.isClosed, true);
  assert.deepEqual(stopped, ["video", "other"]);
});

test("a permission request resolving after close cannot leave the camera running", async () => {
  let resolveRequest;
  let stopped = 0;
  const pending = new Promise((resolve) => { resolveRequest = resolve; });
  const session = new CameraSession();
  const result = session.open(() => pending);
  session.close();
  resolveRequest({ getTracks: () => [{ stop: () => stopped++ }] });
  assert.equal(await result, null);
  assert.equal(stopped, 1);
});

test("capture waits for real dimensions and a playing decoded frame", () => {
  const ready = { videoWidth: 1920, videoHeight: 1080, readyState: 2, paused: false };
  assert.equal(canCaptureVideo(ready), true);
  assert.equal(canCaptureVideo({ ...ready, videoWidth: 0 }), false);
  assert.equal(canCaptureVideo({ ...ready, videoHeight: 0 }), false);
  assert.equal(canCaptureVideo({ ...ready, readyState: 1 }), false);
  assert.equal(canCaptureVideo({ ...ready, paused: true }), false);
});

test("captured and uploaded photos share exact size and type boundaries", () => {
  assert.equal(photoValidationError({ size: MAX_PHOTO_BYTES, type: "image/jpeg" }), null);
  assert.match(photoValidationError({ size: MAX_PHOTO_BYTES + 1, type: "image/jpeg" }), /too large/);
  assert.match(photoValidationError({ size: 10, type: "image/heic" }), /JPEG, PNG, or WebP/);
  assert.equal(photoValidationError({ size: 10, type: "" }), null);
});

test("camera errors give recovery instructions without relying on exception instances", () => {
  assert.match(cameraErrorMessage({ name: "NotAllowedError" }), /browser settings/);
  assert.match(cameraErrorMessage({ name: "NotFoundError" }), /No camera/);
  assert.match(cameraErrorMessage({ name: "NotReadableError" }), /other apps/);
  assert.match(cameraErrorMessage(null), /upload a photo/);
});

test("capture saves intrinsic video pixels without cropping or guide overlays, and rejects encoding failures", async () => {
  const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2, paused: false };
  const drawn = [];
  let encoded = new Blob(["synthetic camera frame"], { type: "image/jpeg" });
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage: (...args) => drawn.push(args) }), toBlob: (callback) => callback(encoded) };
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: (tag) => { assert.equal(tag, "canvas"); return canvas; } };
  try {
    const photo = await capturePhoto(video, "top");
    assert.equal(photo.type, "image/jpeg");
    assert.match(photo.name, /^pigweigh-top-\d+\.jpg$/);
    assert.equal(canvas.width, 1920);
    assert.equal(canvas.height, 1080);
    assert.deepEqual(drawn, [[video, 0, 0]]);
    encoded = null;
    await assert.rejects(capturePhoto(video, "side"), /could not be saved/);
    encoded = new Blob([new Uint8Array(MAX_PHOTO_BYTES + 1)], { type: "image/jpeg" });
    await assert.rejects(capturePhoto(video, "side"), /too large/);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("torch is hidden for unsupported capabilities and never inferred from applyConstraints alone", async () => {
  const { CameraSession } = require(path.join(compiled, "camera.js"));
  let stopped=0, applied=[];
  const track={readyState:"live",getCapabilities:()=>({}),getSettings:()=>({}),applyConstraints:async(c)=>applied.push(c),stop:()=>stopped++};
  const session=new CameraSession(); await session.open(async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]}));
  assert.equal(session.torchState(),"unsupported"); assert.equal(await session.setTorch(true),"unsupported"); assert.equal(applied.length,0);
  track.getCapabilities=()=>({torch:true});
  assert.equal(session.torchState(),"unconfirmed"); assert.equal(await session.setTorch(true),"unconfirmed");
  assert.deepEqual(applied,[{advanced:[{torch:true}]}]); session.close(); assert.equal(stopped,1);
});

test("torch on and off are reported only after track settings confirm them", async () => {
  const { CameraSession } = require(path.join(compiled, "camera.js"));
  let enabled=false;
  const track={readyState:"live",getCapabilities:()=>({torch:true}),getSettings:()=>({torch:enabled}),applyConstraints:async({advanced})=>{enabled=advanced[0].torch},stop(){this.readyState="ended"}};
  const session=new CameraSession(); await session.open(async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]}));
  assert.equal(session.torchState(),"off"); assert.equal(await session.setTorch(true),"on"); assert.equal(await session.setTorch(false),"off");
  session.close(); assert.equal(session.torchState(),"unsupported");
});

test("rejected torch constraints and delayed completion after dismissal do not revive tracks", async () => {
  const { CameraSession } = require(path.join(compiled, "camera.js"));
  let finish, stopped=0;
  const track={readyState:"live",getCapabilities:()=>({torch:true}),getSettings:()=>({torch:false}),applyConstraints:async()=>{throw new Error("denied")},stop(){stopped++;this.readyState="ended"}};
  const session=new CameraSession(); await session.open(async()=>({getTracks:()=>[track],getVideoTracks:()=>[track]}));
  await assert.rejects(session.setTorch(true),/denied/); assert.equal(session.torchState(),"off");
  track.applyConstraints=()=>new Promise((resolve)=>{finish=resolve});
  const pending=session.setTorch(true); session.close(); finish();
  assert.equal(await pending,"unsupported"); assert.equal(stopped,1); assert.equal(session.torchState(),"unsupported");
});
