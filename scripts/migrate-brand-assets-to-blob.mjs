import { put } from "@vercel/blob";

const sourceBaseUrl = process.env.REPLIT_RAINMAKER_BASE_URL || "https://edgquote.replit.app";

const assets = [
  {
    filename: "brand-cover.jpg",
    contentType: "image/jpeg",
  },
  {
    filename: "brand-logo.png",
    contentType: "image/png",
  },
  {
    filename: "brand-back.jpg",
    contentType: "image/jpeg",
  },
];

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("BLOB_READ_WRITE_TOKEN is required to migrate brand assets to Vercel Blob.");
  process.exit(1);
}

function parseDataUri(dataUri, expectedContentType) {
  const match = /^data:([^;]+);base64,(.+)$/.exec(dataUri);
  if (!match) {
    throw new Error("Expected a base64 data URI from the brand asset endpoint.");
  }

  const [, contentType, base64] = match;
  if (contentType !== expectedContentType) {
    throw new Error(`Expected ${expectedContentType}, received ${contentType}.`);
  }

  return Buffer.from(base64, "base64");
}

for (const asset of assets) {
  const sourceUrl = new URL(`/api/brand-assets/${asset.filename}`, sourceBaseUrl);
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${asset.filename}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json();
  const buffer = parseDataUri(payload.dataUri, asset.contentType);
  const pathname = `brand-assets/${asset.filename}`;

  const blob = await put(pathname, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    contentType: asset.contentType,
  });

  console.log(`${asset.filename}\t${buffer.byteLength}\t${blob.pathname}`);
}
