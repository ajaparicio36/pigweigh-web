import type { Metadata } from "next";
import { AdminPanel } from "@/components/admin-panel";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = { title: "Price administration" };

export default function AdminPage(): React.JSX.Element {
  return (
    <>
      <AppHeader current="admin" />
      <main id="main-content" className="page-shell admin-shell">
        <div className="page-heading">
          <h1>Price administration</h1>
          <p>Manage the published Philippine peso price used for valuation.</p>
        </div>
        <AdminPanel />
      </main>
    </>
  );
}
