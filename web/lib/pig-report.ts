import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { savedKeypointPhoto, type RepeatSession } from "./repeat-test";

async function jpeg(photo: Blob): Promise<Uint8Array> {
  const image = await createImageBitmap(photo, { imageOrientation: "from-image" });
  try {
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1100 / Math.max(image.width, image.height));
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare the report photos.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) =>
      canvas.toBlob((blob) => {
        if (blob) void blob.arrayBuffer().then(resolve, reject);
        else reject(new Error("Could not encode a report photo."));
      }, "image/jpeg", 0.88)));
  } finally {
    image.close();
  }
}

export async function downloadPigReport(pigs: RepeatSession[]): Promise<void> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pdf.setTitle("PigWeigh photo and keypoint report");
  const views = ["top", "side"] as const;
  for (const pig of pigs) {
    const results = pig.attempts.flatMap((attempt) => attempt.result ? [{
      attempt, kg: Number(attempt.result.estimated_weight_kg),
    }] : []).filter(({ kg }) => Number.isFinite(kg)).sort((a, b) => a.kg - b.kg);
    const page = pdf.addPage([595.28, 841.89]);
    const text = (label: string, x: number, y: number, size = 11, heading = false): void => {
      const font = heading ? bold : regular;
      const safe = Array.from(label, (char) => {
        try { font.encodeText(char); return char; } catch { return "?"; }
      }).join("");
      const width = font.widthOfTextAtSize(safe, size);
      page.drawText(safe, { x, y, size: Math.min(size, size * (559 - x) / Math.max(width, 1)), font, color: rgb(0.19, 0.13, 0.12) });
    };
    text("PIGWEIGH / FINAL 1.0", 36, 799, 10, true);
    text(pig.pig, 36, 761, 24, true);
    const average = results.reduce((total, { kg }) => total + kg, 0) / results.length;
    const range = results.length > 1 ? `${results[0].kg.toFixed(2)} to ${results.at(-1)!.kg.toFixed(2)} kg` : "Unavailable";
    text(results.length ? `Mean: ${average.toFixed(2)} kg   |   Observed range: ${range}   |   Estimates: ${results.length}` :
      "Weight estimate unavailable", 36, 733);
    const pairs = results.filter(({ attempt }) => attempt.top && attempt.side);
    const representative = pairs[Math.floor((pairs.length - 1) / 2)];
    const firstPair = pig.attempts.find(({ top, side }) => top && side);
    const attempt = representative?.attempt ?? firstPair;
    if (representative) text(`Photo set ${representative.attempt.number}  |  Estimate: ${representative.kg.toFixed(2)} kg`, 36, 706);
    for (const [index, view] of views.entries()) {
      const x = 36 + index * 266;
      const name = view === "top" ? "Top view" : "Side view";
      const photo = attempt?.[view] ?? pig.batch?.[view][0]?.file;
      const overlay = attempt ? await savedKeypointPhoto(attempt, view) : null;
      for (const [row, source] of [photo, overlay].entries()) {
        const y = 450 - row * 262;
        text(row ? `${name} with saved keypoints` : name, x, y + 227, 11, true);
        if (!source) {
          text(row ? "No saved keypoint overlay." : "No photo saved.", x, y + 198);
          continue;
        }
        const image = await pdf.embedJpg(await jpeg(source));
        const size = image.scaleToFit(250, 214);
        page.drawImage(image, { x: x + (250 - size.width) / 2, y: y + (214 - size.height) / 2, ...size });
      }
    }
    text("Ranges are the lowest and highest saved estimates for this pig.", 36, 108, 9);
    text("Saved keypoint edits are included where available.", 36, 92, 9);
  }
  const url = URL.createObjectURL(new Blob([new Uint8Array(await pdf.save())], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "PigWeigh - Photo and Keypoint Report.pdf";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
