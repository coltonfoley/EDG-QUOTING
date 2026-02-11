// PDF Image Pipeline with GIF conversion, compression, and caching

const PDF_MAX_IMAGE_DIMENSION = 1200;
const PDF_JPEG_QUALITY = 0.75;

const imageCache = new Map<string, { dataUrl: string; format: 'PNG' | 'JPEG' }>();

export async function normalizeImageToDataUrl(src: string): Promise<{ dataUrl: string; format: 'PNG' | 'JPEG' }> {
  if (imageCache.has(src)) {
    return imageCache.get(src)!;
  }

  try {
    let blob: Blob;

    if (src.startsWith('data:image/')) {
      const resp = await fetch(src);
      blob = await resp.blob();
    } else if (src.startsWith('blob:')) {
      const blobResp = await fetch(src);
      blob = await blobResp.blob();
    } else {
      const response = await fetch(src, {
        headers: { 'Accept': 'image/*' },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      blob = await response.blob();
    }

    const mimeType = blob.type.toLowerCase();
    const hasTransparency = mimeType === 'image/png' || mimeType === 'image/gif';
    const targetFormat: 'PNG' | 'JPEG' = hasTransparency ? 'PNG' : 'JPEG';

    const dataUrl = await compressImageViaCanvas(blob, targetFormat);
    const result = { dataUrl, format: targetFormat };

    imageCache.set(src, result);
    return result;
  } catch (error) {
    console.error('Error normalizing image:', error);
    throw new Error(`Failed to normalize image: ${error}`);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read blob as data URL'));
    reader.readAsDataURL(blob);
  });
}

function compressImageViaCanvas(blob: Blob, targetFormat: 'PNG' | 'JPEG'): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(blob);

    img.onload = () => {
      let { width, height } = img;

      if (width > PDF_MAX_IMAGE_DIMENSION || height > PDF_MAX_IMAGE_DIMENSION) {
        const scale = Math.min(PDF_MAX_IMAGE_DIMENSION / width, PDF_MAX_IMAGE_DIMENSION / height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to get canvas context'));
        return;
      }

      canvas.width = width;
      canvas.height = height;

      if (targetFormat === 'JPEG') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
      }

      ctx.drawImage(img, 0, 0, width, height);

      const mimeType = targetFormat === 'PNG' ? 'image/png' : 'image/jpeg';
      const quality = targetFormat === 'JPEG' ? PDF_JPEG_QUALITY : undefined;

      canvas.toBlob((convertedBlob) => {
        URL.revokeObjectURL(objectUrl);
        if (convertedBlob) {
          blobToDataUrl(convertedBlob).then(resolve).catch(reject);
        } else {
          reject(new Error('Failed to compress image'));
        }
      }, mimeType, quality);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
}

export function clearImageCache(): void {
  imageCache.clear();
}

export function getImageCacheSize(): number {
  return imageCache.size;
}

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
