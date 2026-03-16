let cachedCover: string | null = null;
let cachedLogo: string | null = null;
let cachedBack: string | null = null;

async function fetchBrandAsset(filename: string): Promise<string> {
  const response = await fetch(`/api/brand-assets/${filename}`);
  if (!response.ok) {
    throw new Error(`Failed to load brand asset: ${filename}`);
  }
  const data = await response.json();
  return data.dataUri;
}

export async function getBrandCoverJPG(): Promise<string> {
  if (!cachedCover) {
    cachedCover = await fetchBrandAsset('brand-cover.jpg');
  }
  return cachedCover;
}

export async function getBrandLogoPNG(): Promise<string> {
  if (!cachedLogo) {
    cachedLogo = await fetchBrandAsset('brand-logo.png');
  }
  return cachedLogo;
}

export async function getBrandBackPagePNG(): Promise<string> {
  if (!cachedBack) {
    cachedBack = await fetchBrandAsset('brand-back.jpg');
  }
  return cachedBack;
}
