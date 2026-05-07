import { put as putBlob } from '@vercel/blob/client';
import { apiRequest } from './queryClient';

export type QuoteImageType = 'cover-photo' | 'product-rendering';

type QuoteImageUploadTarget =
  | {
      uploadMode: 'vercel-blob-client-token';
      clientToken: string;
      objectPath: string;
      pathname: string;
    }
  | {
      uploadMode: 'signed-url';
      uploadUrl: string;
      objectPath: string;
      publicUrl?: string;
    };

export interface UploadedQuoteImageMetadata {
  filename: string;
  originalName: string;
  storageUrl: string;
  mimeType: string;
  fileSize: number;
}

const sanitizeFilename = (filename: string) => filename.replace(/[^a-zA-Z0-9.-]/g, '_');
const MAX_UPLOAD_DIMENSION = 1600;
const JPEG_UPLOAD_QUALITY = 0.82;

async function prepareImageForStorage(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) {
    return file;
  }

  try {
    const image = await loadImage(file);
    const scale = Math.min(1, MAX_UPLOAD_DIMENSION / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) {
      return file;
    }

    canvas.width = width;
    canvas.height = height;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_UPLOAD_QUALITY);
    });

    if (!blob || blob.size >= file.size) {
      return file;
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'quote-image';
    return new File([blob], `${baseName}.jpg`, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };

    image.src = objectUrl;
  });
}

export async function uploadQuoteImage(
  file: File,
  imageType: QuoteImageType,
): Promise<UploadedQuoteImageMetadata> {
  const uploadFile = await prepareImageForStorage(file);
  const uploadTargetResponse = await apiRequest('POST', '/api/images/upload-url', {
    imageType,
    filename: uploadFile.name,
  });
  const target = await uploadTargetResponse.json() as QuoteImageUploadTarget;
  let objectPath = target.objectPath;
  let storageUrl = 'publicUrl' in target ? target.publicUrl : undefined;

  if (target.uploadMode === 'vercel-blob-client-token') {
    const blob = await putBlob(target.pathname, uploadFile, {
      access: 'public',
      token: target.clientToken,
      contentType: uploadFile.type || 'application/octet-stream',
      multipart: uploadFile.size > 5 * 1024 * 1024,
    });
    objectPath = blob.pathname;
    storageUrl = blob.url;
  } else {
    const uploadResponse = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': uploadFile.type || 'application/octet-stream' },
      body: uploadFile,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload image to storage');
    }
  }

  const finalizeResponse = await apiRequest('POST', '/api/images/finalize-upload', {
    objectPath,
  });
  const finalized = await finalizeResponse.json() as { objectPath: string; publicUrl?: string };

  return {
    filename: sanitizeFilename(uploadFile.name),
    originalName: file.name,
    storageUrl: finalized.publicUrl || storageUrl || finalized.objectPath || objectPath,
    mimeType: uploadFile.type || 'application/octet-stream',
    fileSize: uploadFile.size,
  };
}
