import { describe, expect, it } from "vitest";
import { imageProxySchema } from "../validation-schemas";

describe("Public image route SSRF boundary", () => {
  it("allows only approved Vercel Blob HTTPS hosts", () => {
    expect(imageProxySchema.safeParse({
      url: "https://example.public.blob.vercel-storage.com/quote-images/photo.jpg",
    }).success).toBe(true);
  });

  it("rejects non-HTTPS, private, and unapproved hosts", () => {
    for (const url of [
      "http://example.public.blob.vercel-storage.com/photo.jpg",
      "https://127.0.0.1/photo.jpg",
      "https://192.168.1.10/photo.jpg",
      "https://example.com/photo.jpg",
    ]) {
      expect(imageProxySchema.safeParse({ url }).success).toBe(false);
    }
  });
});
