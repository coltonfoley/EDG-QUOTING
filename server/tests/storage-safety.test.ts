import { afterEach, describe, expect, it } from "vitest";
import {
  getObjectStorageProvider,
  normalizeObjectEntityId,
  normalizeVercelBlobLocator,
} from "../objectStorage";

const originalProvider = process.env.OBJECT_STORAGE_PROVIDER;

afterEach(() => {
  if (originalProvider === undefined) {
    delete process.env.OBJECT_STORAGE_PROVIDER;
  } else {
    process.env.OBJECT_STORAGE_PROVIDER = originalProvider;
  }
});

describe("Object storage safety boundaries", () => {
  it("defaults to Vercel Blob and rejects unknown providers", () => {
    delete process.env.OBJECT_STORAGE_PROVIDER;
    expect(getObjectStorageProvider()).toBe("vercel-blob");

    process.env.OBJECT_STORAGE_PROVIDER = "unknown";
    expect(() => getObjectStorageProvider()).toThrow(/Unsupported OBJECT_STORAGE_PROVIDER/);
  });

  it("normalizes object ids without allowing traversal", () => {
    expect(normalizeObjectEntityId("/quotes/123/photo.png")).toBe("quotes/123/photo.png");
    expect(() => normalizeObjectEntityId("../secrets.txt")).toThrow(/Invalid object id/);
    expect(() => normalizeObjectEntityId("quotes/../secrets.txt")).toThrow(/Invalid object id/);
  });

  it("accepts Blob URLs and normalizes legacy object locators", () => {
    expect(normalizeVercelBlobLocator("/objects/quotes/123/photo.png")).toBe(
      "quotes/123/photo.png",
    );
    expect(normalizeVercelBlobLocator("https://example.public.blob.vercel-storage.com/photo.png")).toBe(
      "https://example.public.blob.vercel-storage.com/photo.png",
    );
  });
});
