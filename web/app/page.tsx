import { AppHeader } from "@/components/app-header";
import { EstimateForm } from "@/components/estimate-form";

export default function Home(): React.JSX.Element {
  return (
    <>
      <AppHeader current="estimate" />
      <main id="main-content" className="page-shell">
        <div className="page-heading">
          <h1>Estimate live weight</h1>
          <p>Start with two photos of the same pig: one from above and one from the side.</p>
        </div>
        <EstimateForm />
      </main>
      <footer className="page-footer">PigWeigh is an experimental thesis project. Estimates are not guaranteed sale prices.</footer>
    </>
  );
}
