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

export async function uploadQuoteImage(
  file: File,
  imageType: QuoteImageType,
): Promise<UploadedQuoteImageMetadata> {
  const uploadTargetResponse = await apiRequest('POST', '/api/images/upload-url', {
    imageType,
    filename: file.name,
  });
  const target = await uploadTargetResponse.json() as QuoteImageUploadTarget;
  let objectPath = target.objectPath;
  let storageUrl = 'publicUrl' in target ? target.publicUrl : undefined;

  if (target.uploadMode === 'vercel-blob-client-token') {
    const blob = await putBlob(target.pathname, file, {
      access: 'public',
      token: target.clientToken,
      contentType: file.type || 'application/octet-stream',
      multipart: file.size > 5 * 1024 * 1024,
    });
    objectPath = blob.pathname;
    storageUrl = blob.url;
  } else {
    const uploadResponse = await fetch(target.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      body: file,
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
    filename: sanitizeFilename(file.name),
    originalName: file.name,
    storageUrl: finalized.publicUrl || storageUrl || finalized.objectPath || objectPath,
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
  };
}
