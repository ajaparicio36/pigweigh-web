import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../", import.meta.url));
const compiled = mkdtempSync(path.join(tmpdir(), "pigweigh-ui-contracts-"));
const require = createRequire(import.meta.url);
try {
  execFileSync(process.execPath, [path.join(project, "node_modules/typescript/bin/tsc"), "lib/api.ts", "lib/format.ts", "--outDir", compiled, "--target", "es2020", "--module", "commonjs", "--strict", "--skipLibCheck"], { cwd: project, stdio: "pipe" });
} catch (error) {
  rmSync(compiled, { recursive: true, force: true });
  throw error;
}
after(() => rmSync(compiled, { recursive: true, force: true }));
const { formatMoney, normalizePrice } = require(path.join(compiled, "format.js"));
const { ApiError, isPriceSnapshot, isReadiness, isAdminSession, isEstimate, request } = require(path.join(compiled, "api.js"));

// Synthetic protocol fixtures exercise software parsing, never inference accuracy.
const price = { id: "1", php_per_kg: "210.50", source_reference: "Test reference", published_at: "2026-10-19T00:00:00Z" };

test("money stays exact through the full signed-64-bit centavo range", () => {
  assert.equal(normalizePrice(" 000210.5 "), "210.50");
  assert.equal(normalizePrice("0.01"), "0.01");
  assert.equal(normalizePrice("92233720368547758.07"), "92233720368547758.07");
  assert.equal(formatMoney("92233720368547758.07"), "₱92,233,720,368,547,758.07");
  assert.equal(formatMoney("90071992547409.93"), "₱90,071,992,547,409.93");
  for (const value of ["0", "-1", "1.001", "1e3", "Infinity", "NaN", "1,000", "92233720368547758.08", "", ".5"]) assert.equal(normalizePrice(value), null, value);
  assert.throws(() => formatMoney("210.5"));
});

test("wire guards reject malformed money, unsafe revisions and invalid provenance", () => {
  assert.equal(isPriceSnapshot({ revision: 0, price: null }), true);
  assert.equal(isPriceSnapshot({ revision: 1, price }), true);
  assert.equal(isPriceSnapshot({ revision: Number.MAX_SAFE_INTEGER + 1, price }), false);
  assert.equal(isPriceSnapshot({ revision: 1, price: { ...price, php_per_kg: 210.5 } }), false);
  assert.equal(isPriceSnapshot({ revision: 1, price: { ...price, php_per_kg: "0.00" } }), false);
  assert.equal(isPriceSnapshot({ revision: 1, price: { ...price, published_at: "not-a-date" } }), false);
  assert.equal(isPriceSnapshot({ revision: 1, price: { ...price, published_at: "2026-10-19T00:00:00" } }), false);
  assert.equal(isReadiness({ ready: false, blockers: [{ code: "missing", message: "Unavailable" }] }), true);
  assert.equal(isReadiness({ ready: true, blockers: [{ code: "missing", message: "Unavailable" }] }), false);
  assert.equal(isAdminSession({ admin: { id: 1, username: "admin" } }), false);
  assert.equal(isAdminSession({ admin: { id: "1", username: "admin" } }), true);
});

test("numerical output needs a complete real-success contract", () => {
  const value = { status: "estimated", estimated_weight_kg: "90.25", valuation: null, valuation_unavailable_reason: "no_price", artifacts: { bundle_id: "synthetic-parser-fixture" } };
  assert.equal(isEstimate(value), true);
  assert.equal(isEstimate({ ...value, estimated_weight_kg: "0.00" }), false);
  assert.equal(isEstimate({ ...value, artifacts: {} }), false);
  assert.equal(isEstimate({ ...value, valuation_unavailable_reason: undefined }), false);
  assert.equal(isEstimate({ ...value, valuation: { amount_php: "18997.63", price } }), true);
  assert.equal(isEstimate({ error: { code: "inference_unavailable" } }), false);
});

test("fetch keeps same-origin cookies/no-store and preserves structured failures", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(url, "/api/prices/current");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      return Response.json({ revision: 0, price: null });
    };
    assert.deepEqual(await request("/prices/current", isPriceSnapshot), { revision: 0, price: null });
    globalThis.fetch = async () => Response.json({ error: { code: "inference_unavailable", message: "Models unavailable", details: {} } }, { status: 503 });
    await assert.rejects(request("/estimates", isEstimate), (error) => error instanceof ApiError && error.status === 503 && error.code === "inference_unavailable");
    globalThis.fetch = async () => new Response("Upstream failed", { status: 502 });
    await assert.rejects(request("/prices/current", isPriceSnapshot), (error) => error instanceof ApiError && error.status === 502);
    globalThis.fetch = async () => Response.json({ revision: 1, price: "bad" });
    await assert.rejects(request("/prices/current", isPriceSnapshot), (error) => error instanceof ApiError && error.code === "invalid_response");
  } finally { globalThis.fetch = original; }
});
