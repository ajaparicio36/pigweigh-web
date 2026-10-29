import Link from "next/link";

export function AppHeader({ current }: { current: "estimate" | "admin" | "marker" }): React.JSX.Element {
  return (
    <header className="app-header">
      <div className="header-inner">
        <Link href="/" className="wordmark" aria-label="PigWeigh home">Pig<span>Weigh</span></Link>
        <nav aria-label="Main navigation">
          <Link href="/" aria-current={current === "estimate" ? "page" : undefined}>Estimate</Link>
          <Link href="/marker" aria-current={current === "marker" ? "page" : undefined}>Print marker</Link>
          <Link href="/admin" aria-current={current === "admin" ? "page" : undefined}>Admin</Link>
        </nav>
      </div>
    </header>
  );
}
