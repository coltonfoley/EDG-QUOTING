import { createRequire } from "node:module";
import type { File, Storage } from "@google-cloud/storage";
import { head, put } from "@vercel/blob";
import { Response } from "express";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const require = createRequire(import.meta.url);

export type ObjectStorageProvider = "replit" | "vercel-blob";

type SignObjectUrlParams = {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
};

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

type ObjectEntityUploadTarget =
  | {
      provider: "replit";
      uploadMode: "signed-url";
      uploadUrl: string;
      objectPath: string;
    }
  | {
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

  if (provider === "replit" || provider === "vercel-blob") {
    return provider;
  }

  throw new Error(
    `Unsupported OBJECT_STORAGE_PROVIDER "${provider}". Supported providers: replit, vercel-blob.`
  );
}

function createReplitObjectStorageClient(): Storage {
  const { Storage: GoogleStorage } = require("@google-cloud/storage") as typeof import("@google-cloud/storage");
  return new GoogleStorage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

// Legacy compatibility client. It is loaded only when a legacy storage route is
// actually called; Vercel Blob requests do not initialize the GCS client.
let legacyObjectStorageClient: Storage | undefined;
export const objectStorageClient = {
  bucket(bucketName: string) {
    legacyObjectStorageClient ??= createReplitObjectStorageClient();
    return legacyObjectStorageClient.bucket(bucketName);
  },
};

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// The object storage service is used to interact with the object storage service.
export class ObjectStorageService {
  constructor() {}

  async getObjectEntityUploadTarget(
    customPath?: string,
    options: ClientUploadTargetOptions = {}
  ): Promise<ObjectEntityUploadTarget> {
    const objectId = normalizeObjectEntityId(customPath || `uploads/${randomUUID()}`);

    switch (getObjectStorageProvider()) {
      case "replit": {
        const { url, objectPath } = await this.getObjectEntityUploadURL(objectId);
        return {
          provider: "replit",
          uploadMode: "signed-url",
          uploadUrl: url,
          objectPath,
        };
      }
      case "vercel-blob": {
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
    }
  }

  async uploadPublicObjectEntityBuffer(
    objectId: string,
    buffer: Buffer,
    options: UploadObjectBufferOptions = {}
  ): Promise<UploadedObjectEntity> {
    const normalizedObjectId = normalizeObjectEntityId(objectId);

    switch (getObjectStorageProvider()) {
      case "replit":
        return this.uploadReplitObjectEntityBuffer(
          normalizedObjectId,
          buffer,
          options
        );
      case "vercel-blob":
        return uploadVercelBlobObjectEntityBuffer(
          normalizedObjectId,
          buffer,
          options
        );
    }
  }

  private async uploadReplitObjectEntityBuffer(
    objectId: string,
    buffer: Buffer,
    options: UploadObjectBufferOptions
  ): Promise<UploadedObjectEntity> {
    const privateObjectDir = this.getPrivateObjectDir();
    const fullPath = `${privateObjectDir}/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);

    await file.save(buffer, {
      metadata: {
        contentType: options.contentType || "application/octet-stream",
      },
    });

    return {
      provider: "replit",
      objectPath: `/objects/${objectId}`,
    };
  }

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  // Search for a public object from the search paths.
  async searchPublicObject(filePath: string): Promise<File | null> {
    assertReplitObjectStorage("Public object search");

    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      // Full path format: /<bucket_name>/<object_name>
      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      // Check if file exists
      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  // Downloads an object to the response.
  async downloadObject(file: File, res: Response, cacheTtlSec: number = 3600) {
    try {
      // Get file metadata
      const [metadata] = await file.getMetadata();
      // Get the ACL policy for the object.
      const aclPolicy = await getObjectAclPolicy(file);
      const isPublic = aclPolicy?.visibility === "public";
      // Set appropriate headers
      res.set({
        "Content-Type": metadata.contentType || "application/octet-stream",
        "Content-Length": metadata.size,
        "Cache-Control": `${
          isPublic ? "public" : "private"
        }, max-age=${cacheTtlSec}`,
      });

      // Stream the file to the response
      const stream = file.createReadStream();

      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (!res.headersSent) {
        res.status(500).json({ error: "Error downloading file" });
      }
    }
  }

  // Gets the upload URL for an object entity with custom path support
  async getObjectEntityUploadURL(customPath?: string): Promise<{url: string, objectPath: string}> {
    assertReplitObjectStorage("Signed browser upload URLs");

    const privateObjectDir = this.getPrivateObjectDir();
    if (!privateObjectDir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }

    const objectId = customPath || `uploads/${randomUUID()}`;
    const fullPath = `${privateObjectDir}/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    // Sign URL for PUT method with TTL
    const url = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    return {
      url,
      objectPath: `/objects/${objectId}`
    };
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<File> {
    assertReplitObjectStorage("Object entity file lookup");

    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  normalizeObjectEntityPath(
    rawPath: string,
  ): string {
    assertReplitObjectStorage("Object entity path normalization");

    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }
  
    // Extract the path from the URL by removing query parameters and domain
    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;
  
    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }
  
    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }
  
    // Extract the entity ID from the path
    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }

  // Tries to set the ACL policy for the object entity and return the normalized path.
  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectFile = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectFile, aclPolicy);
    return normalizedPath;
  }

  async getPublicObjectEntityMetadata(rawPath: string): Promise<PublicObjectEntityMetadata> {
    switch (getObjectStorageProvider()) {
      case "replit":
        return {
          provider: "replit",
          objectPath: this.normalizeObjectEntityPath(rawPath),
        };
      case "vercel-blob": {
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
  }

  // Checks if the user can access the object entity.
  async canAccessObjectEntity({
    userId,
    objectFile,
    requestedPermission,
  }: {
    userId?: string;
    objectFile: File;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectFile,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: SignObjectUrlParams): Promise<string> {
  switch (getObjectStorageProvider()) {
    case "replit":
      return signReplitObjectURL({ bucketName, objectName, method, ttlSec });
    case "vercel-blob":
      throw new Error(
        "Signed object URLs are not supported for OBJECT_STORAGE_PROVIDER=vercel-blob yet. " +
          "Use server-side uploads or add Vercel Blob client-upload routes."
      );
  }
}

async function signReplitObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: SignObjectUrlParams): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure OBJECT_STORAGE_PROVIDER=replit is running on Replit`
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}

export function normalizeObjectEntityId(objectId: string): string {
  const normalizedObjectId = objectId.replace(/^\/+/, "");

  if (!normalizedObjectId || normalizedObjectId.includes("..")) {
    throw new Error("Invalid object id");
  }

  return normalizedObjectId;
}

export function normalizeVercelBlobLocator(rawPath: string): string {
  if (/^https?:\/\//i.test(rawPath)) {
    return rawPath;
  }

  return normalizeObjectEntityId(rawPath.replace(/^\/objects\//, ""));
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

function assertReplitObjectStorage(feature: string) {
  if (getObjectStorageProvider() !== "replit") {
    throw new Error(
      `${feature} is still Replit-only. Convert this flow to Vercel Blob client uploads before enabling it with OBJECT_STORAGE_PROVIDER=vercel-blob.`
    );
  }
}
