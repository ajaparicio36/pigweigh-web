import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { EstimateForm } from "@/components/estimate-form";

export default function Home(): React.JSX.Element {
  return (
    <>
      <AppHeader current="estimate" />
      <main id="main-content" className="page-shell">
        <div className="page-heading">
          <h1>Estimate Hog Live Weight</h1>
          <p><Link href="/marker">Print the ArUco marker</Link> at 100% scale. Check that the black square is 10 cm on each side, then take a top and side photo of the same pig.</p>
        </div>
        <EstimateForm />
      </main>
      <footer className="page-footer">PigWeigh is an experimental thesis project. Estimates are not guaranteed sale prices.</footer>
    </>
  );
}
