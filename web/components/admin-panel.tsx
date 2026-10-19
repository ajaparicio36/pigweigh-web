"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, errorMessage, isAdminSession, isPriceSnapshot, jsonBody, logout, request, type AdminSession, type LoadState, type PriceSnapshot } from "@/lib/api";
import { formatMoney, normalizePrice } from "@/lib/format";
import { CurrentPrice } from "./current-price";

type AuthState = { status: "checking" } | { status: "signed-out" } | { status: "signed-in"; session: AdminSession } | { status: "error"; message: string };
type Notice = { kind: "error" | "success" | "info"; message: string } | null;

export function AdminPanel(): React.JSX.Element {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });
  const [price, setPrice] = useState<LoadState<PriceSnapshot>>({ status: "loading" });
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState<"login" | "publish" | "logout" | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [priceError, setPriceError] = useState("");
  const [referenceError, setReferenceError] = useState("");
  const [needsReview, setNeedsReview] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const activeRequest = useRef(false);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    request("/auth/session", isAdminSession, { signal: controller.signal }).then(
      (session) => setAuth({ status: "signed-in", session }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setAuth(error instanceof ApiError && error.status === 401 ? { status: "signed-out" } : { status: "error", message: errorMessage(error) });
      },
    );
    request("/prices/current", isPriceSnapshot, { signal: controller.signal }).then(
      (data) => setPrice({ status: "ready", data }),
      (error: unknown) => { if (!controller.signal.aborted) setPrice({ status: "error", message: errorMessage(error) }); },
    );
    return () => controller.abort();
  }, []);

  async function refreshPrice(): Promise<void> {
    setPrice({ status: "loading" });
    try { setPrice({ status: "ready", data: await request("/prices/current", isPriceSnapshot) }); }
    catch (error: unknown) { setPrice({ status: "error", message: errorMessage(error) }); }
  }

  async function checkSession(): Promise<void> {
    setAuth({ status: "checking" });
    try { setAuth({ status: "signed-in", session: await request("/auth/session", isAdminSession) }); }
    catch (error: unknown) { setAuth(error instanceof ApiError && error.status === 401 ? { status: "signed-out" } : { status: "error", message: errorMessage(error) }); }
  }

  async function signIn(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (activeRequest.current) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const username = fields.get("username");
    const password = fields.get("password");
    if (typeof username !== "string" || typeof password !== "string") return;
    activeRequest.current = true; setBusy("login"); setNotice(null);
    try {
      const session = await request("/auth/login", isAdminSession, jsonBody({ username: username.trim(), password }));
      form.reset();
      setAuth({ status: "signed-in", session });
      await refreshPrice();
      setNotice({ kind: "success", message: "Signed in. You can now publish a price." });
    } catch (error: unknown) { setNotice({ kind: "error", message: errorMessage(error) }); }
    finally { activeRequest.current = false; setBusy(null); noticeRef.current?.focus(); }
  }

  async function signOut(): Promise<void> {
    if (activeRequest.current) return;
    activeRequest.current = true; setBusy("logout"); setNotice(null);
    try {
      await logout(); setAuth({ status: "signed-out" }); setAmount(""); setReference(""); setNeedsReview(false); setReviewed(false);
      setNotice({ kind: "info", message: "You’ve signed out." });
    } catch (error: unknown) { setNotice({ kind: "error", message: errorMessage(error) }); }
    finally { activeRequest.current = false; setBusy(null); }
  }

  async function publish(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (activeRequest.current || price.status !== "ready" || (needsReview && !reviewed)) return;
    const normalized = normalizePrice(amount);
    const source = reference.trim();
    setPriceError(normalized ? "" : "Enter a positive price with up to two decimal places, within the supported range.");
    setReferenceError(source.length > 0 && source.length <= 500 ? "" : "Add a source reference of 1 to 500 characters.");
    if (!normalized || !source || source.length > 500) return;
    activeRequest.current = true; setBusy("publish"); setNotice(null);
    try {
      const data = await request("/prices", isPriceSnapshot, jsonBody({ php_per_kg: normalized, source_reference: source, expected_revision: price.data.revision }));
      setPrice({ status: "ready", data }); setAmount(""); setReference(""); setNeedsReview(false); setReviewed(false);
      setNotice({ kind: "success", message: `${formatMoney(normalized)} per kg is now published. The new price takes effect immediately.` });
    } catch (error: unknown) {
      if (error instanceof ApiError && error.status === 409) {
        setNeedsReview(true); setReviewed(false);
        setNotice({ kind: "error", message: "Another price was published while you were editing. Your draft is saved here. Review the latest price before publishing." });
        await refreshPrice();
      } else if (error instanceof ApiError && error.status === 401) {
        setAuth({ status: "signed-out" }); setNeedsReview(true); setReviewed(false);
        setNotice({ kind: "error", message: "Your session has ended. Sign in again, then review the current price before publishing. Your draft is kept on this page." });
      } else { setNotice({ kind: "error", message: `${errorMessage(error)} Your draft is still here.` }); }
    } finally { activeRequest.current = false; setBusy(null); noticeRef.current?.focus(); }
  }

  return (
    <div className="flow-stack">
      <div ref={noticeRef} tabIndex={-1} className="outcome-region" aria-live="polite" aria-atomic="true">
        {notice && <div className={`notice${notice.kind === "error" ? " notice-error" : ""}`}><p>{notice.message}</p></div>}
      </div>
      {auth.status === "checking" && <div className="form-panel" role="status" aria-busy="true"><h2>Checking your session</h2><p className="muted">Verifying sign-in with the server…</p></div>}
      {auth.status === "error" && <div className="notice notice-error"><h2>Session check failed</h2><p>{auth.message}</p><button type="button" className="button button-secondary" onClick={() => void checkSession()}>Retry session check</button></div>}
      {auth.status === "signed-out" && <div className="login-layout">
        <form className="form-panel login-form" onSubmit={(event) => void signIn(event)} aria-labelledby="login-title">
          <div className="section-heading"><h2 id="login-title">Admin sign in</h2><p className="muted">Use your assigned admin account to publish a price.</p></div>
          <div className="field"><label htmlFor="username">Username</label><input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={64} disabled={busy === "login"} /></div>
          <div className="field"><label htmlFor="password">Password</label><input id="password" name="password" type="password" autoComplete="current-password" required maxLength={128} disabled={busy === "login"} /></div>
          <button className="button button-primary" type="submit" disabled={busy === "login"}>{busy === "login" ? "Signing in…" : "Sign in"}</button>
        </form>
        <aside className="login-context"><h2>One published price</h2><p>Each valuation uses the current price per kilogram and records its source.</p><p className="muted">Photo estimates are available without an admin account. Sign-in is only for price administration.</p></aside>
      </div>}
      {auth.status === "signed-in" && <>
        <div className="session-row"><p>Signed in as <strong>{auth.session.admin.username}</strong></p><button type="button" className="button button-secondary" disabled={busy !== null} onClick={() => void signOut()}>{busy === "logout" ? "Signing out…" : "Sign out"}</button></div>
        <CurrentPrice state={price} onRetry={() => void refreshPrice()} />
        <form className="form-panel publication-form" onSubmit={(event) => void publish(event)} aria-labelledby="publish-title">
          <div className="section-heading"><h2 id="publish-title">Publish a new price</h2><p className="muted">The new price takes effect immediately. Previously calculated valuations keep their original price.</p></div>
          <div className="publication-fields">
            <div className="field"><label htmlFor="price">Price per kilogram</label><div className="amount-input"><span aria-hidden="true">₱</span><input id="price" name="php_per_kg" type="text" inputMode="decimal" value={amount} required maxLength={24} disabled={busy !== null} aria-describedby={`price-help${priceError ? " price-error" : ""}`} aria-invalid={Boolean(priceError)} onChange={(event) => { setAmount(event.target.value); setPriceError(""); }} /><span aria-hidden="true">/ kg</span></div><p id="price-help" className="field-help">Philippine pesos. Up to two decimal places.</p>{priceError && <p id="price-error" className="field-error" role="alert">{priceError}</p>}</div>
            <div className="field"><label htmlFor="reference">Source reference</label><textarea id="reference" name="source_reference" rows={3} required maxLength={500} value={reference} disabled={busy !== null} aria-describedby={`reference-help${referenceError ? " reference-error" : ""}`} aria-invalid={Boolean(referenceError)} onChange={(event) => { setReference(event.target.value); setReferenceError(""); }} /><p id="reference-help" className="field-help">Name the publication, report or other source. Include its date or link where useful.</p>{referenceError && <p id="reference-error" className="field-error" role="alert">{referenceError}</p>}</div>
          </div>
          {needsReview && <div className="review-price"><p>Review the current published price above. Your draft has not been published.</p><label className="checkbox-label"><input type="checkbox" checked={reviewed} disabled={price.status !== "ready" || busy !== null} onChange={(event) => setReviewed(event.target.checked)} />I’ve reviewed the current price and want to publish my draft.</label></div>}
          <div className="publish-actions"><p className="field-help">{price.status !== "ready" ? "Load the current price before publishing." : "Publication creates a new price record with your source reference."}</p><button type="submit" className="button button-primary" disabled={busy !== null || price.status !== "ready" || (needsReview && !reviewed)}>{busy === "publish" ? "Publishing…" : "Publish price"}</button></div>
        </form>
      </>}
    </div>
  );
}
