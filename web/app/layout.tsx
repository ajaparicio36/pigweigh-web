import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PigWeigh Beta | Live weight estimation", template: "%s | PigWeigh Beta" },
  description: "An experimental thesis tool for paired pig photos, estimated live weight, and published Philippine peso prices.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.JSX.Element {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
