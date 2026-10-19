import { isMoney, normalizePrice } from "./format";

export type Price = { id: string; php_per_kg: string; source_reference: string; published_at: string };
export type PriceSnapshot = { revision: number; price: Price | null };
export type Readiness = { ready: boolean; blockers: Array<{ code: string; message: string }> };
export type AdminSession = { admin: { id: string; username: string } };
export type Estimate = {
  status: "estimated";
  estimated_weight_kg: string;
  valuation: { amount_php: string; price: Price } | null;
  valuation_unavailable_reason?: "no_price";
  artifacts: { bundle_id: string };
};
export type LoadState<T> = { status: "loading" } | { status: "ready"; data: T } | { status: "error"; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPrice(value: unknown): value is Price {
  return isRecord(value) && typeof value.id === "string" && value.id.length > 0
    && isMoney(value.php_per_kg) && normalizePrice(value.php_per_kg) === value.php_per_kg
    && typeof value.source_reference === "string" && value.source_reference.trim().length > 0
    && typeof value.published_at === "string" && /(?:Z|\+00:00)$/.test(value.published_at)
    && Number.isFinite(Date.parse(value.published_at));
}

export function isPriceSnapshot(value: unknown): value is PriceSnapshot {
  return isRecord(value) && typeof value.revision === "number"
    && Number.isSafeInteger(value.revision) && value.revision >= 0
    && (value.price === null || isPrice(value.price));
}

export function isReadiness(value: unknown): value is Readiness {
  return isRecord(value) && typeof value.ready === "boolean" && Array.isArray(value.blockers)
    && value.blockers.every((item: unknown) => isRecord(item) && typeof item.code === "string" && typeof item.message === "string")
    && (!value.ready || value.blockers.length === 0);
}

export function isAdminSession(value: unknown): value is AdminSession {
  return isRecord(value) && isRecord(value.admin) && typeof value.admin.id === "string"
    && value.admin.id.length > 0 && typeof value.admin.username === "string" && value.admin.username.length > 0;
}

export function isEstimate(value: unknown): value is Estimate {
  if (!isRecord(value) || value.status !== "estimated" || typeof value.estimated_weight_kg !== "string"
    || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value.estimated_weight_kg)
    || !/[1-9]/.test(value.estimated_weight_kg) || !isRecord(value.artifacts)
    || typeof value.artifacts.bundle_id !== "string" || value.artifacts.bundle_id.length === 0) return false;
  if (value.valuation === null) return value.valuation_unavailable_reason === "no_price";
  return isRecord(value.valuation) && isMoney(value.valuation.amount_php) && isPrice(value.valuation.price);
}

export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "We couldn’t connect. Check your connection and try again.";
}

export async function request<T>(path: string, guard: (value: unknown) => value is T, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, { ...options, credentials: "same-origin", cache: "no-store" });
  const value: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (isRecord(value) && isRecord(value.error) && typeof value.error.code === "string" && typeof value.error.message === "string") {
      throw new ApiError(response.status, value.error.code, value.error.message);
    }
    throw new ApiError(response.status, "service_unavailable", "The service couldn’t complete this request. Please try again.");
  }
  if (!guard(value)) throw new ApiError(response.status, "invalid_response", "The service returned an unexpected response. Please try again.");
  return value;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin", cache: "no-store" });
  if (!response.ok) throw new ApiError(response.status, "logout_failed", "Sign-out failed. Please try again.");
}

export function jsonBody(value: unknown): Pick<RequestInit, "method" | "headers" | "body"> {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value) };
}
