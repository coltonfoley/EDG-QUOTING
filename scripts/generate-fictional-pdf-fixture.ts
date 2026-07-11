import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { generateSignedPDF } from "../client/src/lib/generate-signed-pdf";
import {
  fictionalQuoteGroups,
  fictionalSignedQuote,
} from "../server/tests/fixtures/fictional-signed-quote";

const fixtureDirectory = resolve(
  process.cwd(),
  "docs/audits/rainmaker-app-audit-2026-07-10/fixtures",
);
const outputPath = resolve(fixtureDirectory, "fictional-signed-quote.pdf");

function svgData(width: number, height: number, title: string, subtitle: string) {
  const escapeXml = (value: string) => value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return Buffer.from(`
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#123f4a"/>
      <rect x="70" y="70" width="${width - 140}" height="${height - 140}" fill="none" stroke="#d6a84a" stroke-width="8"/>
      <text x="50%" y="46%" text-anchor="middle" fill="#ffffff" font-family="Arial" font-weight="700" font-size="64">${escapeXml(title)}</text>
      <text x="50%" y="53%" text-anchor="middle" fill="#d6a84a" font-family="Arial" font-size="34">${escapeXml(subtitle)}</text>
    </svg>
  `);
}

async function dataUrl(
  format: "jpeg" | "png",
  width: number,
  height: number,
  title: string,
  subtitle: string,
) {
  const pipeline = sharp(svgData(width, height, title, subtitle));
  const bytes = format === "jpeg"
    ? await pipeline.jpeg({ quality: 90 }).toBuffer()
    : await pipeline.png().toBuffer();
  return `data:image/${format};base64,${bytes.toString("base64")}`;
}

await mkdir(fixtureDirectory, { recursive: true });

const [coverJpg, logoPng, backPageJpg] = await Promise.all([
  dataUrl("jpeg", 1275, 1650, "RAINMAKER", "FICTIONAL DOCUMENT FIXTURE"),
  dataUrl("png", 800, 240, "EDG PATIO & SHADE", "TEST ONLY"),
  dataUrl("jpeg", 1275, 1650, "THANK YOU", "TEST DOCUMENT - NOT A CUSTOMER AGREEMENT"),
]);

const blob = await generateSignedPDF({
  quote: fictionalSignedQuote,
  groups: fictionalQuoteGroups,
  includeImages: false,
  includePricing: true,
  includeContract: true,
  includeApprovalDrawing: false,
  brandAssets: { coverJpg, logoPng, backPageJpg },
});

await writeFile(outputPath, Buffer.from(await blob.arrayBuffer()));
process.stdout.write(`${outputPath}\n`);
