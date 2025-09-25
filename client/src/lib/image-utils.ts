/**
 * Utility functions for handling image URLs with CORS proxy support
 */

/**
 * Converts an object storage URL to use the backend proxy to bypass CORS
 * @param imageUrl The original image URL
 * @returns The proxied URL or original URL if not object storage
 */
export function getProxiedImageUrl(imageUrl: string): string {
  // If already an absolute URL, return as-is
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  
  // Handle quote-images URLs - ensure they're absolute for Puppeteer
  if (imageUrl.includes('/quote-images/')) {
    // If running in browser, use window.location.origin
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${imageUrl.startsWith('/') ? imageUrl : '/' + imageUrl}`;
    }
    // Fallback for server-side rendering (shouldn't happen in this context)
    return imageUrl;
  }
  
  // Only proxy Replit object storage URLs that have CORS issues
  if (imageUrl.includes('storage.replit.com')) {
    const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
    // Make proxy URL absolute for Puppeteer
    if (typeof window !== 'undefined') {
      return `${window.location.origin}${proxyUrl}`;
    }
    return proxyUrl;
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