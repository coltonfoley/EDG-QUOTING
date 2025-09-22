/**
 * Utility functions for managing quote images (cover photos and product renderings)
 * Integrates with existing ObjectStorageService and database storage
 */

import { ObjectStorageService } from "./objectStorage";
import { storage } from "./storage";
import type { InsertQuoteCoverPhoto, InsertQuoteProductRendering, QuoteCoverPhoto, QuoteProductRendering } from "@shared/schema";
import path from "path";

export interface ImageUploadRequest {
  file: {
    originalname: string;
    mimetype: string;
    size: number;
    buffer: Buffer;
  };
  quoteId: number;
  displayOrder?: number; // For product renderings only
}

export interface ImageUploadResult {
  uploadUrl: string;
  objectPath: string;
  metadata: {
    filename: string;
    originalName: string;
    mimeType: string;
    fileSize: number;
    quoteId: number;
    displayOrder?: number;
  };
}

export interface UploadedImageRecord {
  coverPhoto?: QuoteCoverPhoto;
  productRendering?: QuoteProductRendering;
  publicUrl: string;
}

export class QuoteImageUploadService {
  private objectStorageService: ObjectStorageService;

  constructor() {
    this.objectStorageService = new ObjectStorageService();
  }

  /**
   * Validates image file types and size limits
   */
  validateImageFile(file: Express.Multer.File): { isValid: boolean; error?: string } {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif'
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return {
        isValid: false,
        error: `Unsupported file type: ${file.mimetype}. Please upload JPEG, PNG, WebP, or GIF images.`
      };
    }

    // 10MB limit for images
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: `File size too large: ${Math.round(file.size / 1024 / 1024)}MB. Maximum allowed is 10MB.`
      };
    }

    return { isValid: true };
  }

  /**
   * Generates a safe filename for object storage
   */
  generateStorageFilename(originalName: string, quoteId: number, type: 'cover' | 'rendering'): string {
    const ext = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    
    return `quote-${quoteId}/${type}s/${timestamp}-${baseName}${ext}`;
  }

  /**
   * Creates an upload URL for a cover photo
   */
  async createCoverPhotoUploadUrl(quoteId: number, originalName: string): Promise<ImageUploadResult> {
    const filename = this.generateStorageFilename(originalName, quoteId, 'cover');
    const { url, objectPath } = await this.objectStorageService.getObjectEntityUploadURL(filename);

    return {
      uploadUrl: url,
      objectPath,
      metadata: {
        filename,
        originalName,
        mimeType: '', // Will be set when finalizing
        fileSize: 0, // Will be set when finalizing
        quoteId
      }
    };
  }

  /**
   * Creates an upload URL for a product rendering
   */
  async createProductRenderingUploadUrl(
    quoteId: number, 
    originalName: string, 
    displayOrder?: number
  ): Promise<ImageUploadResult> {
    const filename = this.generateStorageFilename(originalName, quoteId, 'rendering');
    const { url, objectPath } = await this.objectStorageService.getObjectEntityUploadURL(filename);

    return {
      uploadUrl: url,
      objectPath,
      metadata: {
        filename,
        originalName,
        mimeType: '', // Will be set when finalizing
        fileSize: 0, // Will be set when finalizing
        quoteId,
        displayOrder
      }
    };
  }

  /**
   * Finalizes cover photo upload and saves to database
   */
  async finalizeCoverPhotoUpload(
    objectPath: string,
    mimeType: string,
    fileSize: number,
    metadata: ImageUploadResult['metadata'],
    userId: string
  ): Promise<UploadedImageRecord> {
    // Set ACL policy for the uploaded image
    const normalizedPath = await this.objectStorageService.trySetObjectEntityAclPolicy(
      objectPath,
      {
        owner: userId,
        visibility: "public" // Make cover photos public for sharing
      }
    );

    // Create cover photo record in database
    const coverPhotoData: InsertQuoteCoverPhoto = {
      quoteId: metadata.quoteId,
      filename: metadata.filename,
      originalName: metadata.originalName,
      storageUrl: normalizedPath,
      fileSize,
      mimeType
    };

    const coverPhoto = await storage.createQuoteCoverPhoto(coverPhotoData);

    return {
      coverPhoto,
      publicUrl: normalizedPath
    };
  }

  /**
   * Finalizes product rendering upload and saves to database
   */
  async finalizeProductRenderingUpload(
    objectPath: string,
    mimeType: string,
    fileSize: number,
    metadata: ImageUploadResult['metadata'],
    userId: string
  ): Promise<UploadedImageRecord> {
    // Set ACL policy for the uploaded image
    const normalizedPath = await this.objectStorageService.trySetObjectEntityAclPolicy(
      objectPath,
      {
        owner: userId,
        visibility: "public" // Make renderings public for sharing
      }
    );

    // Create product rendering record in database
    const renderingData: InsertQuoteProductRendering = {
      quoteId: metadata.quoteId,
      filename: metadata.filename,
      originalName: metadata.originalName,
      storageUrl: normalizedPath,
      fileSize,
      mimeType,
      displayOrder: metadata.displayOrder || 0
    };

    const productRendering = await storage.createQuoteProductRendering(renderingData);

    return {
      productRendering,
      publicUrl: normalizedPath
    };
  }

  /**
   * Gets the public URL for an image
   */
  getPublicImageUrl(storageUrl: string, protocol: string, host: string): string {
    // If it's already a full URL, return as-is
    if (storageUrl.startsWith('http')) {
      return storageUrl;
    }

    // Construct public URL using the current request host
    return `${protocol}://${host}${storageUrl}`;
  }

  /**
   * Deletes an image from object storage (called when soft-deleting from database)
   */
  async deleteImageFromStorage(storageUrl: string): Promise<boolean> {
    try {
      const file = await this.objectStorageService.getObjectEntityFile(storageUrl);
      await file.delete();
      return true;
    } catch (error) {
      console.error("Error deleting image from storage:", error);
      return false;
    }
  }

  /**
   * Gets all images for a quote (cover photo + product renderings)
   */
  async getQuoteImages(quoteId: number): Promise<{
    coverPhoto?: QuoteCoverPhoto;
    productRenderings: QuoteProductRendering[];
  }> {
    const coverPhoto = await storage.getQuoteCoverPhoto(quoteId);
    const productRenderings = await storage.getQuoteProductRenderings(quoteId);

    return {
      coverPhoto: coverPhoto || undefined,
      productRenderings
    };
  }

  /**
   * Cleans up all images for a quote (used when deleting quote)
   */
  async cleanupQuoteImages(quoteId: number): Promise<void> {
    const images = await this.getQuoteImages(quoteId);

    // Delete from object storage
    const deletePromises: Promise<boolean>[] = [];

    if (images.coverPhoto) {
      deletePromises.push(this.deleteImageFromStorage(images.coverPhoto.storageUrl));
    }

    for (const rendering of images.productRenderings) {
      deletePromises.push(this.deleteImageFromStorage(rendering.storageUrl));
    }

    // Wait for all storage deletions to complete
    await Promise.all(deletePromises);

    // Soft delete from database
    await storage.deleteQuoteImagesByQuoteId(quoteId);
  }
}

// Export singleton instance
export const quoteImageService = new QuoteImageUploadService();