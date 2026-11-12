import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "PigWeigh 1.0 | Live weight estimation", template: "%s | PigWeigh 1.0" },
  description: "Estimate hog live weight from paired photos and view published Philippine peso prices.",
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
