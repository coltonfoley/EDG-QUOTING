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

/**
 * Server-side PDF to images conversion using text extraction fallback
 * This is a temporary solution until proper PDF-to-image conversion is implemented
 */
export async function convertPDFToImagesServer(pdfBuffer: Buffer): Promise<Array<{ index: number; imageBase64: string }>> {
  try {
    // For now, we'll use text extraction and send that to vision processing
    // This bypasses the client-side PDF.js issues entirely
    
    // Import pdf-parse dynamically to avoid issues
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(pdfBuffer);
    
    // Create a mock image representation with the text content
    // OpenAI vision can process this as an image with text
    const textContent = data.text.substring(0, 2000); // Limit text length
    
    // Create SVG with the PDF text content
    const svgContent = `
      <svg width="800" height="1000" xmlns="http://www.w3.org/2000/svg" style="background: white;">
        <rect width="800" height="1000" fill="white" stroke="black" stroke-width="1"/>
        <foreignObject x="20" y="20" width="760" height="960">
          <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: Arial; font-size: 12px; line-height: 1.4; padding: 10px;">
            ${textContent.replace(/[<>&"]/g, (m) => ({
              '<': '&lt;',
              '>': '&gt;',
              '&': '&amp;',
              '"': '&quot;'
            }[m] || m))}
          </div>
        </foreignObject>
      </svg>
    `;
    
    // Convert SVG to base64
    const base64Image = Buffer.from(svgContent).toString('base64');
    
    console.log(`📄 Generated text-based image representation: ${textContent.length} characters`);
    
    return [{
      index: 0,
      imageBase64: base64Image
    }];
    
  } catch (error) {
    console.error('Server-side PDF conversion error:', error);
    throw new Error(`Failed to convert PDF to images on server: ${error.message}`);
  }
}