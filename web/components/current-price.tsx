import { type LoadState, type PriceSnapshot } from "@/lib/api";
import { formatMoney, formatPublishedAt } from "@/lib/format";

export function CurrentPrice({ state, onRetry }: { state: LoadState<PriceSnapshot>; onRetry: () => void }): React.JSX.Element {
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
    </section>
  );
}
