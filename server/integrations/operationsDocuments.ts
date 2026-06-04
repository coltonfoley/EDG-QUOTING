import { createHash } from "crypto";
import { get as getBlob } from "@vercel/blob";
import sharp from "sharp";
import { ObjectStorageService, getObjectStorageProvider } from "../objectStorage";
import { storage } from "../storage";
import { generateSignedPDF } from "../../client/src/lib/generate-signed-pdf";
import { generateBomPDF } from "../../client/src/lib/generate-bom-pdf";

type HandoffDocumentKind = "contract" | "bill_of_materials";

export type HandoffDocument = {
  kind: HandoffDocumentKind;
  type: "Contract" | "Bill of Materials";
  fileName: string;
  contentType: "application/pdf";
  contentBase64: string;
  contentSha256: string;
  sourceDocumentKey: string;
  sourceQuoteId: string;
  sourceQuoteNumber: string | null;
  visibility: "internal";
  metadata: Record<string, unknown>;
};

type PdfImage = { dataUrl: string; format: "PNG" | "JPEG" };

type BrandAssets = {
  coverJpg: string;
  logoPng: string;
  backPageJpg: string;
};

const PDF_MAX_IMAGE_DIMENSION = 1200;
const PDF_JPEG_QUALITY = 75;

const BRAND_ASSET_MAP: Record<keyof BrandAssets, { objectPath: string; contentType: string }> = {
  coverJpg: { objectPath: "brand-assets/brand-cover.jpg", contentType: "image/jpeg" },
  logoPng: { objectPath: "brand-assets/brand-logo.png", contentType: "image/png" },
  backPageJpg: { objectPath: "brand-assets/brand-back.jpg", contentType: "image/jpeg" },
};

const sanitizeFilenamePart = (value: unknown, fallback: string): string => {
  const text = String(value || fallback).trim() || fallback;
  return text.replace(/[/\\]/g, "_").replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, "_").slice(0, 80);
};

const getQuoteNumber = (quote: any): string | null =>
  quote.quoteNumber ? String(quote.quoteNumber) : null;

const createSourceDocumentKey = (
  quote: any,
  kind: HandoffDocumentKind,
): string => kind === "contract"
  ? `EDG-QUOTING:quote:${quote.id}:rainmaker_contract_pdf`
  : `EDG-QUOTING:quote:${quote.id}:rainmaker_bom_pdf`;

async function readBlobStream(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      byteLength += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, byteLength);
}

function toDataUri(buffer: Buffer, contentType: string): string {
  return `data:${contentType};base64,${buffer.toString("base64")}`;
}

async function loadBrandAsset(asset: { objectPath: string; contentType: string }): Promise<string> {
  if (getObjectStorageProvider() === "vercel-blob") {
    const blob = await getBlob(asset.objectPath, { access: "public" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      throw new Error(`Brand asset not found: ${asset.objectPath}`);
    }
    return toDataUri(await readBlobStream(blob.stream), asset.contentType);
  }

  const objectStorageService = new ObjectStorageService();
  const file = await objectStorageService.searchPublicObject(asset.objectPath);
  if (!file) {
    throw new Error(`Brand asset not found: ${asset.objectPath}`);
  }

  const [buffer] = await file.download();
  return toDataUri(buffer, asset.contentType);
}

async function loadBrandAssets(): Promise<BrandAssets> {
  const [coverJpg, logoPng, backPageJpg] = await Promise.all([
    loadBrandAsset(BRAND_ASSET_MAP.coverJpg),
    loadBrandAsset(BRAND_ASSET_MAP.logoPng),
    loadBrandAsset(BRAND_ASSET_MAP.backPageJpg),
  ]);

  return { coverJpg, logoPng, backPageJpg };
}

async function loadObjectStorageBuffer(objectPath: string): Promise<Buffer> {
  if (getObjectStorageProvider() === "vercel-blob") {
    const blob = await getBlob(objectPath.replace(/^\/objects\//, ""), { access: "public" });
    if (!blob || blob.statusCode !== 200 || !blob.stream) {
      throw new Error(`Object not found: ${objectPath}`);
    }
    return readBlobStream(blob.stream);
  }

  const objectStorageService = new ObjectStorageService();
  const objectFile = await objectStorageService.getObjectEntityFile(objectPath);
  const [buffer] = await objectFile.download();
  return buffer;
}

async function loadImageBuffer(src: string): Promise<{ buffer: Buffer; contentType: string }> {
  if (src.startsWith("data:")) {
    const [header, payload] = src.split(",", 2);
    const contentType = header.match(/^data:([^;]+)/)?.[1] || "application/octet-stream";
    return { buffer: Buffer.from(payload || "", "base64"), contentType };
  }

  if (src.startsWith("/objects/")) {
    const buffer = await loadObjectStorageBuffer(src);
    return { buffer, contentType: "application/octet-stream" };
  }

  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src, { headers: { Accept: "image/*" } });
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    return { buffer: Buffer.from(await response.arrayBuffer()), contentType };
  }

  const buffer = await loadObjectStorageBuffer(src);
  return { buffer, contentType: "application/octet-stream" };
}

async function normalizeImageToDataUrlServer(src: string): Promise<PdfImage> {
  const { buffer, contentType } = await loadImageBuffer(src);
  const usePng = contentType.toLowerCase().includes("png") || contentType.toLowerCase().includes("gif");
  const format: PdfImage["format"] = usePng ? "PNG" : "JPEG";
  let pipeline = sharp(buffer, { animated: false }).rotate().resize({
    width: PDF_MAX_IMAGE_DIMENSION,
    height: PDF_MAX_IMAGE_DIMENSION,
    fit: "inside",
    withoutEnlargement: true,
  });

  if (format === "PNG") {
    pipeline = pipeline.png();
  } else {
    pipeline = pipeline.flatten({ background: "#ffffff" }).jpeg({ quality: PDF_JPEG_QUALITY });
  }

  const output = await pipeline.toBuffer();
  return {
    dataUrl: toDataUri(output, format === "PNG" ? "image/png" : "image/jpeg"),
    format,
  };
}

async function blobToPdfPayload(blob: Blob): Promise<{ base64: string; sha256: string }> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return {
    base64: buffer.toString("base64"),
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

export async function buildOperationsDocuments(quote: any): Promise<HandoffDocument[]> {
  const quoteNumber = getQuoteNumber(quote);
  const quoteId = String(quote.id);
  const filenameQuotePart = sanitizeFilenamePart(quoteNumber || quoteId, "Quote");
  const groups = await storage.getGroupsByQuoteId(Number(quote.id));
  const coverPhoto = await storage.getQuoteCoverPhoto(Number(quote.id));
  const productRenderings = await storage.getQuoteProductRenderings(Number(quote.id));
  const quoteForPdf = {
    ...quote,
    coverPhoto,
    productRenderings,
  };
  const brandAssets = await loadBrandAssets();

  const [contractPayload, bomPayload] = await Promise.all([
    generateSignedPDF({
      quote: quoteForPdf,
      includeImages: quote.esigIncludeImages ?? false,
      includePricing: quote.esigIncludePricing ?? true,
      includeContract: quote.esigIncludeContract ?? true,
      groups,
      brandAssets,
      normalizeImage: normalizeImageToDataUrlServer,
    }).then(blobToPdfPayload),
    generateBomPDF({
      quote: quoteForPdf,
      groups,
      brandLogoDataUrl: brandAssets.logoPng,
    }).then(blobToPdfPayload),
  ]);

  return [
    {
      kind: "contract",
      type: "Contract",
      fileName: `Quote-${filenameQuotePart}-Contract.pdf`,
      contentType: "application/pdf",
      contentBase64: contractPayload.base64,
      contentSha256: contractPayload.sha256,
      sourceDocumentKey: createSourceDocumentKey(quote, "contract"),
      sourceQuoteId: quoteId,
      sourceQuoteNumber: quoteNumber,
      visibility: "internal",
      metadata: {
        generatedFrom: "rainmaker_signed_quote_pdf",
        quoteVersion: quote.versionNumber ?? null,
        customerSignedAt: quote.clientSignedAt ?? null,
        companySignedAt: quote.companySignedAt ?? null,
        documentFingerprint: quote.signatureAuditTrail?.documentFingerprint ?? null,
        sourceRenderer: "generateSignedPDF",
      },
    },
    {
      kind: "bill_of_materials",
      type: "Bill of Materials",
      fileName: `Quote-${filenameQuotePart}-BOM.pdf`,
      contentType: "application/pdf",
      contentBase64: bomPayload.base64,
      contentSha256: bomPayload.sha256,
      sourceDocumentKey: createSourceDocumentKey(quote, "bill_of_materials"),
      sourceQuoteId: quoteId,
      sourceQuoteNumber: quoteNumber,
      visibility: "internal",
      metadata: {
        generatedFrom: "rainmaker_bom_pdf",
        quoteVersion: quote.versionNumber ?? null,
        lineItemCount: quote.lineItems?.length ?? 0,
        sourceRenderer: "generateBomPDF",
      },
    },
  ];
}
