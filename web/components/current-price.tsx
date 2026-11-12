import { useState } from "react";
import { isPriceHistory, request, type LoadState, type Price, type PriceSnapshot } from "@/lib/api";
import { formatMoney, formatPublishedAt } from "@/lib/format";

export function CurrentPrice({ state, onRetry }: { state: LoadState<PriceSnapshot>; onRetry: () => void }): React.JSX.Element {
  const [history, setHistory] = useState<LoadState<Price[]> | null>(null);

  async function loadHistory() {
    setHistory({ status: "loading" });
    try {
      const { prices } = await request("/prices/history", isPriceHistory);
      setHistory({ status: "ready", data: prices });
    } catch {
      setHistory({ status: "error", message: "Could not load price history. Try again." });
    }
  }

  return (
    <section className="price-strip" aria-labelledby="current-price-title" aria-busy={state.status === "loading"}>
      <div>
        <h2 id="current-price-title">Current published price</h2>
        {state.status === "loading" && <p className="muted" role="status">Loading price…</p>}
        {state.status === "error" && <div className="inline-error"><p>{state.message}</p><button className="text-button" onClick={onRetry} type="button">Retry price</button></div>}
        {state.status === "ready" && !state.data.price && <p className="muted">No price has been published. Valuation will be unavailable until an admin publishes one.</p>}
        {state.status === "ready" && state.data.price && <p className="price-value">{formatMoney(state.data.price.php_per_kg)} <span>per kg</span></p>}
      </div>
      {state.status === "ready" && state.data.price && (
        <div className="price-provenance">
          <p><span className="field-caption">Source reference</span>{state.data.price.source_reference}</p>
          <p className="muted">Published <time dateTime={state.data.price.published_at}>{formatPublishedAt(state.data.price.published_at)}</time> (Philippine time)</p>
        </div>
      )}
      <div>
        <button type="button" className="text-button" disabled={history?.status === "loading"}
          onClick={() => void loadHistory()}>
          {history?.status === "ready" ? "Refresh price history" : "View price history"}
        </button>
        {history?.status === "loading" && <p role="status">Loading price history…</p>}
        {history?.status === "error" && <p role="alert">{history.message}</p>}
        {history?.status === "ready" && (history.data.length ? (
          <ul>
            {history.data.map((price) => (
              <li key={price.id}>
                <time dateTime={price.published_at}>{formatPublishedAt(price.published_at)}</time>
                {" · "}{formatMoney(price.php_per_kg)} per kg
                <p className="muted">{price.source_reference}</p>
              </li>
            ))}
          </ul>
        ) : <p className="muted">No price records yet.</p>)}
      </div>
    </section>
  );
}
