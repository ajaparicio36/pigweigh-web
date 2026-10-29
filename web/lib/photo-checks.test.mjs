import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const compiled = mkdtempSync(path.join(tmpdir(), "pigweigh-photo-check-tests-"));
const require = createRequire(import.meta.url);
try {
  execFileSync(process.execPath, [path.join(project, "node_modules/typescript/bin/tsc"), "lib/photo-checks.ts", "--outDir", compiled, "--target", "es2020", "--module", "commonjs", "--strict", "--skipLibCheck"], { cwd: project, stdio: "pipe" });
} catch (error) {
  rmSync(compiled, { recursive: true, force: true });
  throw error;
}
after(() => rmSync(compiled, { recursive: true, force: true }));
const { PhotoCheckQueue, photosReady } = require(path.join(compiled, "photo-checks.js"));
const { ApiError } = require(path.join(compiled, "api.js"));
const photo = () => new File(["software fixture"], "same-name.jpg", { type: "image/jpeg" });
const settle = () => new Promise((resolve) => setImmediate(resolve));
function harness() {
  const calls = [];
  const queue = new PhotoCheckQueue((view, file, signal) => new Promise((resolve, reject) => {
    calls.push({ view, file, signal, pass: () => resolve({ status: "validated", view, artifacts: { bundle_id: "fixture" } }), fail: reject });
  }));
  return { queue, calls };
}

test("top and side checks serialize; submission requires both current passes and an idle slot", async () => {
  const { queue, calls } = harness();
  queue.select("side", photo());
  queue.select("top", photo());
  assert.deepEqual(calls.map((call) => call.view), ["side"]);
  assert.equal(queue.getSnapshot().top.status, "queued");
  assert.equal(photosReady(queue.getSnapshot()), false);
  calls[0].pass(); await settle();
  assert.deepEqual(calls.map((call) => call.view), ["side", "top"]);
  assert.equal(photosReady(queue.getSnapshot()), false);
  calls[1].pass(); await settle();
  assert.equal(photosReady(queue.getSnapshot()), true);
  queue.select("top", photo());
  assert.equal(photosReady(queue.getSnapshot()), false);
  calls[2].pass(); await settle();
  assert.equal(photosReady(queue.getSnapshot()), true);
});

test("same-named replacement cannot inherit an earlier success or rejection", async () => {
  for (const outcome of ["pass", "fail"]) {
    const { queue, calls } = harness();
    const replacement = photo();
    queue.select("top", photo());
    queue.select("top", replacement);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].signal.aborted, false);
    if (outcome === "pass") calls[0].pass();
    else calls[0].fail(new ApiError(422, "marker_missing", "Missing marker"));
    await settle();
    assert.equal(queue.getSnapshot().top.file, replacement);
    assert.equal(queue.getSnapshot().top.status, "checking");
    assert.equal(calls[1].file, replacement);
    calls[1].pass(); await settle();
    assert.equal(queue.getSnapshot().top.status, "passed");
  }
});

test("queued replaced or removed files are never uploaded", async () => {
  const { queue, calls } = harness();
  const replacement = photo();
  queue.select("top", photo());
  queue.select("side", photo());
  queue.select("side", replacement);
  calls[0].pass(); await settle();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].file, replacement);
  queue.select("top", photo());
  queue.select("top", null);
  calls[1].pass(); await settle();
  assert.equal(calls.length, 2);
  assert.equal(queue.getSnapshot().top.status, "empty");
});

test("removing an active photo ignores its completion and keeps the CPU slot occupied", async () => {
  const { queue, calls } = harness();
  queue.select("top", photo());
  queue.select("top", null);
  assert.equal(queue.getSnapshot().top.status, "empty");
  assert.equal(queue.getSnapshot().running, true);
  calls[0].pass(); await settle();
  assert.equal(queue.getSnapshot().top.status, "empty");
  assert.equal(queue.getSnapshot().running, false);
  assert.equal(photosReady(queue.getSnapshot()), false);
});

test("busy, unavailable, network and malformed responses preserve the file and retry only on request", async () => {
  for (const [error, kind] of [[new ApiError(429, "inference_busy", "Busy"), "busy"], [new ApiError(503, "inference_unavailable", "Unavailable"), "unavailable"], [new TypeError("Network"), "connection"], [new ApiError(200, "invalid_response", "Invalid response"), "service"]]) {
    const { queue, calls } = harness();
    const file = photo();
    queue.select("top", file);
    calls[0].fail(error); await settle();
    assert.equal(queue.getSnapshot().top.kind, kind);
    assert.equal(queue.getSnapshot().top.file, file);
    assert.equal(calls.length, 1);
    queue.retry("side");
    assert.equal(calls.length, 1);
    queue.retry("top"); queue.retry("top");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].file, file);
    calls[1].pass(); await settle();
    assert.equal(queue.getSnapshot().top.status, "passed");
  }
});

test("capture rejection preserves the photo, requires replacement, and never enables submission", async () => {
  const { queue, calls } = harness();
  const file = photo();
  queue.select("top", file);
  calls[0].fail(new ApiError(422, "marker_missing", "Top view: the configured marker was not found.")); await settle();
  assert.equal(queue.getSnapshot().top.kind, "rejected");
  assert.equal(queue.getSnapshot().top.file, file);
  assert.match(queue.getSnapshot().top.message, /marker was not found/);
  queue.retry("top");
  assert.equal(calls.length, 1);
  assert.equal(photosReady(queue.getSnapshot()), false);
});

test("unmount aborts the active fetch, drops queued work and suppresses late notifications", async () => {
  const { queue, calls } = harness();
  let notifications = 0;
  queue.subscribe(() => notifications++);
  queue.select("top", photo());
  queue.select("side", photo());
  queue.dispose();
  const before = notifications;
  assert.equal(calls[0].signal.aborted, true);
  calls[0].pass(); await settle();
  queue.select("top", photo());
  assert.equal(calls.length, 1);
  assert.equal(notifications, before);
});

test("effect setup replay before selection stays usable without duplicate requests", async () => {
  const { queue, calls } = harness();
  queue.resume(); queue.dispose(); queue.resume();
  queue.select("top", photo());
  calls[0].pass(); await settle();
  assert.equal(calls.length, 1);
  assert.equal(queue.getSnapshot().top.status, "passed");
});

test("a preserved page resumes interrupted active and queued checks with explicit retry", async () => {
  const { queue, calls } = harness();
  const top = photo();
  const side = photo();
  queue.select("top", top);
  queue.select("side", side);
  queue.dispose(); queue.resume();
  assert.equal(queue.getSnapshot().running, false);
  assert.equal(queue.getSnapshot().top.kind, "interrupted");
  assert.equal(queue.getSnapshot().side.kind, "interrupted");
  assert.equal(queue.getSnapshot().top.file, top);
  assert.equal(queue.getSnapshot().side.file, side);
  assert.equal(calls.length, 1);
  queue.retry("top");
  queue.retry("side");
  calls[0].pass(); await settle();
  assert.equal(queue.getSnapshot().top.status, "checking");
  assert.equal(calls.length, 2);
  calls[1].pass(); await settle();
  assert.equal(calls.length, 3);
  calls[2].pass(); await settle();
  assert.equal(photosReady(queue.getSnapshot()), true);
});
