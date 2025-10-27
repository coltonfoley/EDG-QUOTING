// PDF Image Pipeline with GIF conversion and caching

// In-memory cache for normalized images
const imageCache = new Map<string, { dataUrl: string; format: 'PNG' | 'JPEG' }>();

/**
 * Normalizes an image to a data URL suitable for PDF generation.
 * - Fetches image data if needed
 * - Converts GIF to PNG (since jsPDF doesn't support GIF reliably)
 * - Caches results to avoid re-processing
 * 
 * @param src - Image source URL (can be blob URL, data URL, or http URL)
 * @returns Promise with data URL and format
 */
export async function normalizeImageToDataUrl(src: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' }> {
  // Check cache first
  if (imageCache.has(src)) {
    return imageCache.get(src)!;
  }

  try {
    // 0) Short-circuit for DATA URLs (no fetch at all)
    if (src.startsWith('data:image/')) {
      const isPng = src.startsWith('data:image/png');
      const isJpeg = src.startsWith('data:image/jpeg') || src.startsWith('data:image/jpg');
      const format: 'PNG' | 'JPEG' = isPng ? 'PNG' : 'JPEG';
      const result = { dataUrl: src, format };
      imageCache.set(src, result);
      return result;
    }

    // 1) Handle BLOB URLs by reading the blob directly (no credentials, no CORS)
    if (src.startsWith('blob:')) {
      const blobResp = await fetch(src); // default credentials:'same-origin'
      const blob = await blobResp.blob();
      const dataUrl = await blobToDataUrl(blob);
      const mime = blob.type.toLowerCase();
      const format: 'PNG' | 'JPEG' =
        mime === 'image/png' ? 'PNG' : 'JPEG';
      const result = { dataUrl, format };
      imageCache.set(src, result);
      return result;
    }

    // 2) For HTTP(S) and relative paths: rely on same-origin cookies automatically.
    // Avoid credentials:'include' which breaks when server replies with ACAO:'*'.
    const response = await fetch(src, {
      headers: { 'Accept': 'image/*' },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();
    const mimeType = blob.type.toLowerCase();

    // Determine if we need to convert
    let targetFormat: 'PNG' | 'JPEG' = 'JPEG';
    let needsConversion = false;

    if (mimeType === 'image/gif') {
      // GIF needs conversion to PNG to preserve quality
      targetFormat = 'PNG';
      needsConversion = true;
    } else if (mimeType === 'image/png') {
      targetFormat = 'PNG';
      needsConversion = false; // PNG is already compatible
    } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      targetFormat = 'JPEG';
      needsConversion = false; // JPEG is already compatible
    } else {
      // Unknown format - convert to JPEG as fallback
      targetFormat = 'JPEG';
      needsConversion = true;
    }

    let dataUrl: string;

    if (needsConversion) {
      // Convert image via canvas
      dataUrl = await convertImageViaCanvas(blob, targetFormat);
    } else {
      // Just convert blob to data URL
      dataUrl = await blobToDataUrl(blob);
    }

    const result = { dataUrl, format: targetFormat };
    
    // Cache the result
    imageCache.set(src, result);
    
    return result;
  } catch (error) {
    console.error('Error normalizing image:', error);
    throw new Error(`Failed to normalize image: ${error}`);
  }
}

/**
 * Converts a blob to a data URL
 */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Converts an image to a specific format using canvas
 */
function convertImageViaCanvas(blob: Blob, targetFormat: 'PNG' | 'JPEG'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Failed to get canvas context'));
      return;
    }

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;

      // For JPEG, fill white background (JPEG doesn't support transparency)
      if (targetFormat === 'JPEG') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      ctx.drawImage(img, 0, 0);

      const mimeType = targetFormat === 'PNG' ? 'image/png' : 'image/jpeg';
      const quality = targetFormat === 'JPEG' ? 0.92 : undefined;

      canvas.toBlob((convertedBlob) => {
        if (convertedBlob) {
          blobToDataUrl(convertedBlob).then(resolve).catch(reject);
        } else {
          reject(new Error('Failed to convert image'));
        }
      }, mimeType, quality);
      
      // Clean up
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image for conversion'));
    };

    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Clears the image cache (useful for memory management)
 */
export function clearImageCache(): void {
  imageCache.clear();
}

/**
 * Gets the current cache size
 */
export function getImageCacheSize(): number {
  return imageCache.size;
}

/**
 * Calculates the dimensions to fit an image within a box while preserving aspect ratio.
 * Uses "contain" strategy - entire image visible, may have letterboxing.
 * 
 * @param imgW - Natural width of the image
 * @param imgH - Natural height of the image
 * @param boxW - Maximum width of the container
 * @param boxH - Maximum height of the container
 * @returns Object with scaled width and height that fit within the box
 */
export function getAspectFitBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number
): { w: number; h: number } {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return {
    w: imgW * scale,
    h: imgH * scale,
  };
}

/**
 * Calculates the centered position for an image within a box.
 * 
 * @param boxX - X position of the container
 * @param boxY - Y position of the container
 * @param boxW - Width of the container
 * @param boxH - Height of the container
 * @param w - Width of the content to center
 * @param h - Height of the content to center
 * @returns Object with centered x and y coordinates
 */
export function getCenteredOrigin(
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  w: number,
  h: number
): { x: number; y: number } {
  const x = boxX + (boxW - w) / 2;
  const y = boxY + (boxH - h) / 2;
  return { x, y };
}

/**
 * Gets the natural dimensions of an image from a data URL.
 * This is needed to calculate aspect ratios before embedding in PDF.
 * 
 * @param dataUrl - Image data URL
 * @returns Promise with image width and height
 */
export function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
    };
    img.onerror = () => {
      reject(new Error('Failed to load image to get dimensions'));
    };
    img.src = dataUrl;
  });
}
