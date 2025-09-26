/**
 * Utility functions for handling image URLs with CORS proxy support
 */

/**
 * Converts an object storage URL to use the backend proxy to bypass CORS
 * @param imageUrl The original image URL
 * @returns The proxied URL or original URL if not object storage
 */
export function getProxiedImageUrl(imageUrl: string): string {
  // Proxy all Replit object storage URLs that have CORS issues in production
  if (imageUrl.includes('storage.replit.com') || 
      imageUrl.includes('.replit.dev') || 
      imageUrl.includes('/quote-images/')) {
    return `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
  }
  
  // Return original URL for other sources (assets, data URLs, etc.)
  return imageUrl;
}

/**
 * Hook for getting a proxied image URL (useful for React components)
 * @param imageUrl The original image URL  
 * @returns The proxied URL or original URL if not object storage
 */
export function useProxiedImageUrl(imageUrl: string | undefined): string | undefined {
  if (!imageUrl) return undefined;
  return getProxiedImageUrl(imageUrl);
}