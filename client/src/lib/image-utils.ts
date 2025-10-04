/**
 * Utility functions for handling image URLs with CORS proxy support
 */

/**
 * Converts an object storage URL to use the backend proxy to bypass CORS
 * @param imageUrl The original image URL
 * @returns The proxied URL or original URL if not object storage
 */
export function getProxiedImageUrl(imageUrl: string): string {
  // Don't proxy relative URLs (they're already on our server)
  if (imageUrl.startsWith('/')) {
    return imageUrl;
  }
  
  // Don't proxy URLs that are already on our own domain (/quote-images/ endpoints)
  if (imageUrl.includes('/quote-images/')) {
    // Extract just the path from the full URL
    try {
      const url = new URL(imageUrl);
      return url.pathname;
    } catch {
      // If URL parsing fails, return as-is
      return imageUrl;
    }
  }
  
  // Proxy external Replit object storage URLs that have CORS issues in production
  if (imageUrl.includes('storage.replit.com')) {
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