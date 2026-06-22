import { head, put } from "@vercel/blob";
import { randomUUID } from "crypto";

export type ObjectStorageProvider = "vercel-blob";

type UploadObjectBufferOptions = {
  contentType?: string;
};

type ClientUploadTargetOptions = {
  allowedContentTypes?: string[];
  cacheControlMaxAge?: number;
  maximumSizeInBytes?: number;
};

type UploadedObjectEntity = {
  provider: ObjectStorageProvider;
  objectPath: string;
  publicUrl?: string;
};

type ObjectEntityUploadTarget = {
  provider: "vercel-blob";
  uploadMode: "vercel-blob-client-token";
  clientToken: string;
  objectPath: string;
  pathname: string;
};

type PublicObjectEntityMetadata = UploadedObjectEntity & {
  contentType?: string;
  size?: number;
};

export function getObjectStorageProvider(): ObjectStorageProvider {
  const provider = (process.env.OBJECT_STORAGE_PROVIDER || "vercel-blob").trim();

  if (provider === "vercel-blob") {
    return provider;
  }

  throw new Error(
    `Unsupported OBJECT_STORAGE_PROVIDER "${provider}". Rainmaker storage uses vercel-blob.`
  );
}

export class ObjectStorageService {
  async getObjectEntityUploadTarget(
    customPath?: string,
    options: ClientUploadTargetOptions = {}
  ): Promise<ObjectEntityUploadTarget> {
    getObjectStorageProvider();

    const objectId = normalizeObjectEntityId(customPath || `uploads/${randomUUID()}`);
    const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
    const clientToken = await generateClientTokenFromReadWriteToken({
      pathname: objectId,
      addRandomSuffix: false,
      allowOverwrite: true,
      allowedContentTypes: options.allowedContentTypes,
      cacheControlMaxAge: options.cacheControlMaxAge ?? 60 * 60 * 24 * 30,
      maximumSizeInBytes: options.maximumSizeInBytes ?? 25 * 1024 * 1024,
      validUntil: Date.now() + 15 * 60 * 1000,
    });

    return {
      provider: "vercel-blob",
      uploadMode: "vercel-blob-client-token",
      clientToken,
      objectPath: objectId,
      pathname: objectId,
    };
  }

  async uploadPublicObjectEntityBuffer(
    objectId: string,
    buffer: Buffer,
    options: UploadObjectBufferOptions = {}
  ): Promise<UploadedObjectEntity> {
    getObjectStorageProvider();
    return uploadVercelBlobObjectEntityBuffer(
      normalizeObjectEntityId(objectId),
      buffer,
      options
    );
  }

  async getPublicObjectEntityMetadata(rawPath: string): Promise<PublicObjectEntityMetadata> {
    getObjectStorageProvider();
    const blob = await head(normalizeVercelBlobLocator(rawPath));

    return {
      provider: "vercel-blob",
      objectPath: blob.pathname,
      publicUrl: blob.url,
      contentType: blob.contentType,
      size: blob.size,
    };
  }
}

function normalizeObjectEntityId(objectId: string): string {
  const normalizedObjectId = objectId.replace(/^\/+/, "");

  if (!normalizedObjectId || normalizedObjectId.includes("..")) {
    throw new Error("Invalid object id");
  }

  return normalizedObjectId;
}

function normalizeVercelBlobLocator(rawPath: string): string {
  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  return normalizeObjectEntityId(rawPath);
}

async function uploadVercelBlobObjectEntityBuffer(
  objectId: string,
  buffer: Buffer,
  options: UploadObjectBufferOptions
): Promise<UploadedObjectEntity> {
  const blob = await put(objectId, buffer, {
    access: "public",
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60 * 60 * 24 * 30,
    contentType: options.contentType || "application/octet-stream",
  });

  return {
    provider: "vercel-blob",
    objectPath: blob.pathname,
    publicUrl: blob.url,
  };
}
