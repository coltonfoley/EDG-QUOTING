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
    let blob: Blob;
    
    // Convert all image sources to blob for EXIF processing
    if (src.startsWith('data:image/') || src.startsWith('blob:')) {
      // DATA URLs and BLOB URLs: simple fetch
      const response = await fetch(src);
      blob = await response.blob();
    } else {
      // HTTP(S) and relative paths: rely on same-origin cookies automatically
      // Avoid credentials:'include' which breaks when server replies with ACAO:'*'
      const response = await fetch(src, {
        headers: { 'Accept': 'image/*' },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      blob = await response.blob();
    }

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
      needsConversion = true; // Always convert to apply EXIF orientation
    } else if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
      targetFormat = 'JPEG';
      needsConversion = true; // Always convert to apply EXIF orientation
    } else {
      // Unknown format - convert to JPEG as fallback
      targetFormat = 'JPEG';
      needsConversion = true;
    }

    // Always convert via canvas to apply EXIF orientation correction
    const dataUrl = await convertImageViaCanvas(blob, targetFormat);

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
 * Reads EXIF orientation from JPEG blob
 * Returns orientation value (1-8) or 1 if not found/not JPEG
 */
async function getExifOrientation(blob: Blob): Promise<number> {
  console.log('[EXIF] Checking EXIF orientation for blob type:', blob.type, 'size:', blob.size);
  
  if (!blob.type.toLowerCase().includes('jpeg') && !blob.type.toLowerCase().includes('jpg')) {
    console.log('[EXIF] Not a JPEG, returning orientation 1');
    return 1; // Not a JPEG, no EXIF
  }

  try {
    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // Check for JPEG SOI marker (0xFFD8)
    if (view.getUint16(0) !== 0xFFD8) {
      console.log('[EXIF] No JPEG SOI marker found, returning orientation 1');
      return 1;
    }

    let offset = 2;
    while (offset < view.byteLength) {
      // Check for segment marker (0xFF)
      if (view.getUint8(offset) !== 0xFF) break;
      
      const marker = view.getUint8(offset + 1);
      
      // APP1 marker (0xE1) contains EXIF data
      if (marker === 0xE1) {
        const segmentLength = view.getUint16(offset + 2);
        const segmentEnd = offset + 2 + segmentLength;
        
        // Check for "Exif\0\0" identifier
        if (view.getUint32(offset + 4) === 0x45786966 && view.getUint16(offset + 8) === 0) {
          const tiffOffset = offset + 10;
          
          // Read TIFF byte order
          const byteOrder = view.getUint16(tiffOffset);
          const littleEndian = byteOrder === 0x4949; // "II" = little endian
          
          // Get IFD offset
          const ifdOffset = view.getUint32(tiffOffset + 4, littleEndian) + tiffOffset;
          
          // Read number of IFD entries
          const tagCount = view.getUint16(ifdOffset, littleEndian);
          
          // Search for Orientation tag (0x0112)
          for (let i = 0; i < tagCount; i++) {
            const tagOffset = ifdOffset + 2 + (i * 12);
            const tag = view.getUint16(tagOffset, littleEndian);
            
            if (tag === 0x0112) { // Orientation tag
              const orientation = view.getUint16(tagOffset + 8, littleEndian);
              console.log('[EXIF] Found orientation tag:', orientation);
              return orientation;
            }
          }
        }
        
        offset = segmentEnd;
      } else {
        // Skip to next segment
        offset += 2 + view.getUint16(offset + 2);
      }
    }
  } catch (e) {
    console.warn('[EXIF] Failed to read EXIF orientation:', e);
  }

  console.log('[EXIF] No orientation tag found, returning orientation 1');
  return 1; // Default: no rotation
}

/**
 * Loads an image as HTMLImageElement for manual EXIF rotation
 * Always uses HTMLImageElement to ensure consistent behavior across all browsers
 */
async function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };
    
    img.src = url;
  });
}

/**
 * Applies EXIF orientation transformations to canvas context
 */
function applyExifOrientation(
  ctx: CanvasRenderingContext2D,
  orientation: number,
  width: number,
  height: number
): void {
  switch (orientation) {
    case 2:
      // Flip horizontal
      ctx.transform(-1, 0, 0, 1, width, 0);
      break;
    case 3:
      // Rotate 180°
      ctx.transform(-1, 0, 0, -1, width, height);
      break;
    case 4:
      // Flip vertical
      ctx.transform(1, 0, 0, -1, 0, height);
      break;
    case 5:
      // Rotate 90° CW + flip horizontal
      ctx.transform(0, 1, 1, 0, 0, 0);
      break;
    case 6:
      // Rotate 90° CW
      ctx.transform(0, 1, -1, 0, height, 0);
      break;
    case 7:
      // Rotate 90° CCW + flip horizontal
      ctx.transform(0, -1, -1, 0, height, width);
      break;
    case 8:
      // Rotate 90° CCW
      ctx.transform(0, -1, 1, 0, 0, width);
      break;
    default:
      // Orientation 1 or unknown: no transformation
      break;
  }
}

/**
 * Converts an image to a specific format using canvas, with EXIF orientation correction
 * Uses ImageBitmap for normal images (orientation 1), manual rotation for others
 */
async function convertImageViaCanvas(blob: Blob, targetFormat: 'PNG' | 'JPEG'): Promise<string> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Read EXIF orientation first
  const orientation = await getExifOrientation(blob);
  
  // For normal orientation, use ImageBitmap for better performance
  if (orientation === 1 && 'createImageBitmap' in window) {
    try {
      const img = await createImageBitmap(blob);
      canvas.width = img.width;
      canvas.height = img.height;
      
      if (targetFormat === 'JPEG') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      
      ctx.drawImage(img, 0, 0);
      
      const mimeType = targetFormat === 'PNG' ? 'image/png' : 'image/jpeg';
      const quality = targetFormat === 'JPEG' ? 0.92 : undefined;
      
      return new Promise((resolve, reject) => {
        canvas.toBlob((convertedBlob) => {
          if (convertedBlob) {
            blobToDataUrl(convertedBlob).then(resolve).catch(reject);
          } else {
            reject(new Error('Failed to convert image'));
          }
        }, mimeType, quality);
      });
    } catch (e) {
      console.warn('createImageBitmap failed, falling back to manual rotation:', e);
      // Fall through to manual rotation
    }
  }
  
  // For rotated images or browsers without createImageBitmap, use manual rotation
  const img = await loadImageElement(blob);
  
  // Get original image dimensions
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  
  // Determine canvas dimensions based on orientation
  // Orientations 5, 6, 7, 8 rotate 90°, swapping width/height
  const needsSwap = orientation >= 5 && orientation <= 8;
  canvas.width = needsSwap ? height : width;
  canvas.height = needsSwap ? width : height;

  // For JPEG, fill white background (JPEG doesn't support transparency)
  if (targetFormat === 'JPEG') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Apply EXIF orientation transformation
  applyExifOrientation(ctx, orientation, width, height);

  // Draw the image
  ctx.drawImage(img, 0, 0);

  const mimeType = targetFormat === 'PNG' ? 'image/png' : 'image/jpeg';
  const quality = targetFormat === 'JPEG' ? 0.92 : undefined;

  return new Promise((resolve, reject) => {
    canvas.toBlob((convertedBlob) => {
      if (convertedBlob) {
        blobToDataUrl(convertedBlob).then(resolve).catch(reject);
      } else {
        reject(new Error('Failed to convert image'));
      }
    }, mimeType, quality);
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
 * Gets the natural dimensions of an image from its data URL
 * Uses EXIF-aware loading to get correct dimensions after orientation is applied
 */
export async function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  // Convert data URL to blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  
  // Read EXIF orientation to get correct dimensions
  const orientation = await getExifOrientation(blob);
  
  // For normal orientation, use ImageBitmap for better performance
  if (orientation === 1 && 'createImageBitmap' in window) {
    try {
      const img = await createImageBitmap(blob);
      return { width: img.width, height: img.height };
    } catch (e) {
      console.warn('createImageBitmap failed, falling back to HTMLImageElement:', e);
      // Fall through to HTMLImageElement
    }
  }
  
  // For rotated images or browsers without createImageBitmap
  const img = await loadImageElement(blob);
  const width = img.naturalWidth;
  const height = img.naturalHeight;
  
  // Swap dimensions for 90° rotations (orientations 5-8)
  if (orientation >= 5 && orientation <= 8) {
    return { width: height, height: width };
  }
  
  return { width, height };
}

/**
 * Calculates dimensions to fit an image within a box while preserving aspect ratio
 * Uses "contain" mode - image will be scaled to fit entirely within the box
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
 * Calculates centered position for an image within a box
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
