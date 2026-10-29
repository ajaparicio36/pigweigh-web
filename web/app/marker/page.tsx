import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";

export const metadata: Metadata = { title: "Print your ArUco marker | PigWeigh" };

export default function MarkerPage(): React.JSX.Element {
  return (
    <>
      <AppHeader current="marker" />
      <main id="main-content" className="page-shell marker-page">
        <div className="page-heading">
          <h1>Print your ArUco marker</h1>
          <p>Use this marker for both PigWeigh photos. Download the ready-to-print PDF, then check its size with a ruler.</p>
        </div>
        <section className="marker-print-layout" aria-labelledby="marker-download-title">
          <figure className="marker-preview">
            <Image src="/markers/pigweigh-aruco-4x4-50-id-0-100mm.svg" alt="PigWeigh ArUco marker, dictionary 4 by 4 50, ID 0, surrounded by a white margin" width={320} height={320} unoptimized />
            <figcaption>Preview only. Print the PDF at actual size.</figcaption>
          </figure>
          <div className="marker-print-content">
            <h2 id="marker-download-title">The marker PigWeigh is set up to read</h2>
            <dl className="marker-specification">
              <div><dt>Pattern family</dt><dd>DICT_4X4_50</dd></div>
              <div><dt>Marker ID</dt><dd>0</dd></div>
              <div><dt>Black square</dt><dd>100 × 100 mm (10 × 10 cm)</dd></div>
              <div><dt>Paper</dt><dd>A4, with a white margin</dd></div>
            </dl>
            <a className="button button-primary" href="/markers/pigweigh-aruco-4x4-50-id-0-100mm.pdf" download="pigweigh-aruco-4x4-50-id-0-100mm.pdf">Download marker PDF</a>
            <p className="field-help">Ready to save and print. The pattern, ID and size stay fixed to match PigWeigh.</p>
          </div>
        </section>
        <div className="marker-guidance">
          <section aria-labelledby="marker-print-title">
            <h2 id="marker-print-title">Before you take photos</h2>
            <ol className="marker-steps">
              <li><strong>Print the downloaded PDF on A4.</strong> Choose 100% or Actual size. Turn off Fit to page and any scaling.</li>
              <li><strong>Measure the black square.</strong> Each side must be 100 mm. Do not include the white margin in your measurement.</li>
              <li><strong>Keep the card flat and the margin intact.</strong> Put it on the back for the top photo, then on the visible flank for the side photo. Keep all four corners visible and avoid covering body landmarks.</li>
            </ol>
            <Link href="/" className="button button-secondary">Continue to photos</Link>
          </section>
          <section className="marker-explanation" aria-labelledby="marker-why-title">
            <h2 id="marker-why-title">Why DICT_4X4_50?</h2>
            <p>It is a family of 50 marker patterns, each using a compact 4 × 4 grid inside a black border. PigWeigh uses one known pattern, ID 0, so both photos use the same reference.</p>
            <p>This family works with the OpenCV marker detector used by PigWeigh. It is a practical compatibility choice, not a claim that it is the best dictionary or a guarantee of weight accuracy.</p>
            <p>The printed size and clear placement matter. The on-screen camera guides help you frame a photo; they do not confirm that a marker has been detected.</p>
          </section>
        </div>
      </main>
      <footer className="page-footer">PigWeigh is an experimental thesis project. Estimates are not guaranteed sale prices.</footer>
    </>
  );
}
