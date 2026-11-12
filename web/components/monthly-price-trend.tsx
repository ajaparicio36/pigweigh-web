import { useEffect, useState } from "react";
import { isPriceHistory, request, type Price } from "@/lib/api";

const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const historical = {
  2024: [18148, 18394, 18549, 18836, 19147, 19472, 17378, 17306, 18061, 17538, 17855, 18271],
  2025: [20374, 21227, 21348, 21032, 21089, 21452, 19382, 19122, 18950, 18365, 17777, 18705],
  2026: [17256, 17631, 17923, 17400, 17156, 17176],
} as const;
const recent = [15768, 15515, 15235];
const total = recent.reduce((sum, cents) => sum + cents, 0);
const change = recent[2] - recent[0];
const project = (monthsFromAugust: number) => Math.round((2 * total + 3 * change * monthsFromAugust) / 6);
const currency = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const chartDate = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium" });
const chartDateISO = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Manila", dateStyle: "short" });
const rangeNames = { "3M": "3 months", "1Y": "1 year", All: "All time" } as const;
const placeholderYears = [2024, 2025, 2026] as const;
const publishedMonth = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "long" });
const publishedTime = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });
const ranges = ["3M", "1Y", "All"] as const;
type Range = (typeof ranges)[number] | number;
type Basis = "PSA national average" | "PSA preliminary" | "Projection" | "Admin published";
type MonthlyPrice = { year: number; month: string; cents: number; basis: Basis; published?: Price };

const history: MonthlyPrice[] = placeholderYears.flatMap((year) => historical[year].map((cents, index) =>
  ({ year, month: months[index], cents, basis: "PSA national average" as const })));
const preliminary: MonthlyPrice[] = recent.map((cents, index) =>
  ({ year: 2026, month: months[index + 6], cents, basis: "PSA preliminary" }));
const forecast: MonthlyPrice[] = [project(2), project(3)].map((cents, index) =>
  ({ year: 2026, month: months[index + 9], cents, basis: "Projection" }));
const allPrices = [...history, ...preliminary, ...forecast];

function pricesFor(range: Range, published: MonthlyPrice[]): MonthlyPrice[] {
  if (published.length) {
    if (range === "All") return published;
    if (typeof range === "number") return published.filter(({ year }) => year === range);
    const latest = new Date(published.at(-1)!.published!.published_at);
    const [year, month] = chartDateISO.format(latest).split("-").map(Number);
    const firstMonth = new Date(Date.UTC(year, month - (range === "3M" ? 3 : 12), 1)).toISOString().slice(0, 7);
    return published.filter(({ published }) => chartDateISO.format(new Date(published!.published_at)).slice(0, 7) >= firstMonth);
  }
  if (range === "All") return allPrices;
  if (range === "3M") return [...preliminary, ...forecast];
  if (range === "1Y") return allPrices.slice(-(12 + forecast.length));
  return allPrices.filter(({ year }) => year === range);
}

export function MonthlyPriceTrend(): React.JSX.Element {
  const [range, setRange] = useState<Range>("3M");
  const [selectedKey, setSelectedKey] = useState("");
  const [published, setPublished] = useState<MonthlyPrice[]>([]);
  const [priceStatus, setPriceStatus] = useState<"loading" | "ready" | "error">("loading");
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    async function refresh(): Promise<void> {
      if (pending) return;
      pending = true;
      try {
        const { prices } = await request("/prices/history", isPriceHistory, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setPublished(prices.slice().reverse().map((price) => {
          const date = new Date(price.published_at);
          return { year: Number(chartDateISO.format(date).slice(0, 4)), month: publishedMonth.format(date),
            cents: Math.round(Number(price.php_per_kg) * 100), basis: "Admin published", published: price };
        }));
        setPriceStatus("ready");
      } catch {
        if (!controller.signal.aborted) setPriceStatus("error");
      } finally {
        pending = false;
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const [today, setToday] = useState<{ label: string; iso: string } | null>(null);
  useEffect(() => {
    function updateDate(): void {
      const now = new Date();
      const iso = chartDateISO.format(now);
      setToday((current) => current?.iso === iso ? current : { label: chartDate.format(now), iso });
    }
    updateDate();
    const timer = window.setInterval(updateDate, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const years: readonly number[] = published.length ? [...new Set(published.map(({ year }) => year))] : placeholderYears;
  const activeRange = typeof range === "number" && !years.includes(range) ? "3M" : range;
  const rangeName = typeof activeRange === "number" ? String(activeRange) : rangeNames[activeRange];
  const series = pricesFor(activeRange, published);
  const entryKey = (entry: MonthlyPrice) => entry.published?.id ?? `${entry.year}-${entry.month}`;
  const labelFor = (entry: MonthlyPrice) => entry.published
    ? publishedTime.format(new Date(entry.published.published_at)) : `${entry.month} ${entry.year}`;
  const matchingIndex = series.findIndex((entry) => entryKey(entry) === selectedKey);
  const selected = matchingIndex < 0 ? series.findLastIndex(({ basis }) => basis !== "Projection") : matchingIndex;
  const current = series[selected];
  const projected = current.basis === "Projection";
  const baseline = series.find(({ basis }) => basis !== "Projection") ?? current;
  const difference = current.cents - baseline.cents;
  const percent = (difference / baseline.cents * 100).toFixed(2);
  const values = series.map(({ cents }) => cents);
  const min = Math.floor(Math.min(...values) / 200) * 2;
  const max = Math.max(min + 2, Math.ceil(Math.max(...values) / 200) * 2);
  const x = (index: number) => series.length === 1 ? 146.5 : 14 + index * 265 / (series.length - 1);
  const y = (cents: number) => 10 + (max - cents / 100) * 82 / (max - min);
  const points = (forecastLine: boolean) => series.flatMap((entry, index) => {
    const projected = entry.basis === "Projection";
    const include = forecastLine ? projected || series[index + 1]?.basis === "Projection" : !projected;
    return include ? [`${x(index)},${y(entry.cents)}`] : [];
  }).join(" ");
  const dateTicks = [...new Set([0, Math.floor((series.length - 1) / 2), series.length - 1])];
  function selectRange(next: Range): void {
    setRange(next);
    setSelectedKey("");
  }

  return <section className="result-panel monthly-price-trend" aria-labelledby="monthly-price-title">
    <div className="market-quote-heading">
      <h2 id="monthly-price-title">Live hog price trend</h2>
      <div className="market-view" aria-label="Chart view and today's date">
        <span>View: {rangeName}</span>
        {today && <time dateTime={today.iso} aria-label={`Today in the Philippines, ${today.label}`}>{today.label}</time>}
      </div>
    </div>
    <div className="market-quote">
      <div aria-live="polite">
        <p className="market-value">{currency.format(current.cents / 100)} <span>/ kg liveweight</span></p>
        <p className="muted">{labelFor(current)} · {current.basis}</p>
        {priceStatus === "error" && <p className="field-help">Published prices could not be refreshed.</p>}
        {!published.length && <p className="field-help">{priceStatus === "loading" ? "Checking for published prices…" : "PSA reference prices"}</p>}
        {difference !== 0 && <p className="market-change">{difference < 0 ? "▼" : "▲"} {currency.format(Math.abs(difference) / 100)} ({percent}%) since {baseline.month} {baseline.year}</p>}
      </div>
    </div>
    <div className="market-plot">
      <p className="market-axis-label">Price (₱/kg liveweight)</p>
      <svg viewBox="0 0 360 125" role="img" aria-labelledby="monthly-chart-title monthly-chart-desc">
        <title id="monthly-chart-title">{`Live hog prices, ${series[0].month} ${series[0].year} to ${series.at(-1)?.month} ${series.at(-1)?.year}`}</title>
        <desc id="monthly-chart-desc">{published.length ? "Prices published by PigWeigh administrators." : "The solid line shows PSA national averages. The dashed line shows projections."} Exact prices are in the price table.</desc>
        {[min, max].map((tick) => <g key={tick}>
          <line x1="14" x2="279" y1={y(tick * 100)} y2={y(tick * 100)} stroke="var(--border)" opacity="0.45" />
          <text x="290" y={y(tick * 100) + 4}>{currency.format(tick)}</text>
        </g>)}
        <line x1={x(selected)} x2={x(selected)} y1="4" y2="99" stroke="var(--control-border)" />
        <polyline points={points(false)} fill="none" stroke="var(--primary-dark)" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        <polyline points={points(true)} fill="none" stroke="var(--muted)" strokeWidth="3" strokeDasharray="6 5" />
        {dateTicks.map((index) => <text key={index} x={x(index)} y="116"
          textAnchor={series.length === 1 ? "middle" : index === 0 ? "start" : index === series.length - 1 ? "end" : "middle"}>
          {series[index].published ? chartDate.format(new Date(series[index].published!.published_at)) : `${series[index].month.slice(0, 3)} ${series[index].year}`}
        </text>)}
        <circle cx={x(selected)} cy={y(current.cents)} r="4" fill={projected ? "var(--surface)" : "var(--primary-dark)"}
          stroke="var(--primary-dark)" strokeWidth="2" />
      </svg>
      <p className="market-axis-label market-time-axis">{published.length ? "Publication date" : "Month and year"}</p>
      {series.some(({ basis }) => basis === "Projection") && <p className="field-help market-line-key">Dashed line shows projected prices.</p>}
    </div>
    <div className="market-months" role="group" aria-label="Price chart range">
      {ranges.map((option) => <button key={option} type="button" aria-pressed={activeRange === option}
        onClick={() => selectRange(option)}>{option}</button>)}
    </div>
    <div className="market-controls">
      <label className="market-month-picker"><span>Year</span><select value={typeof activeRange === "number" ? activeRange : ""} onChange={(event) => {
        const year = years.find((option) => String(option) === event.target.value);
        if (year) selectRange(year);
      }}>
        <option value="" disabled>Choose year</option>
        {years.map((year) => <option key={year}>{year}</option>)}
      </select></label>
      <label className="market-month-picker"><span>{published.length ? "Publication" : "Month"}</span><select value={entryKey(current)} onChange={(event) => setSelectedKey(event.target.value)}>
        {series.map((entry) => <option key={entryKey(entry)} value={entryKey(entry)}>{labelFor(entry)}{entry.basis === "Projection" ? " (projected)" : ""}</option>)}
      </select></label>
    </div>
    <details>
      <summary>{published.length ? "View published prices and sources" : "View monthly prices and sources"}</summary>
      <table>
        <caption className="sr-only">Live hog prices in pesos per kilogram liveweight</caption>
        <thead><tr><th scope="col">{published.length ? "Published" : "Month"}</th><th scope="col">Price per kg</th><th scope="col">{published.length ? "Source" : "Basis"}</th></tr></thead>
        <tbody>{series.map((entry) => <tr key={entryKey(entry)}>
          <th scope="row">{labelFor(entry)}</th><td>{currency.format(entry.cents / 100)}</td><td>{entry.published?.source_reference ?? entry.basis}</td>
        </tr>)}</tbody>
      </table>
      {published.length ? <p className="field-help">Showing up to the latest 50 published prices.</p> :
        <p className="field-help">January 2024 through June 2026 comes from <a href="https://psa.gov.ph/statistics/lp/all-commodity/quarterly">PSA quarterly bulletins</a>. July through September 2026 are preliminary national averages from <a href="https://openstat.psa.gov.ph/PXWeb/pxweb/en/DB/DB__2M__NFG/0032M4AFN12.px/">PSA OpenSTAT</a>. PigWeigh projects October and November from the July through September trend.</p>}
    </details>
  </section>;
}
