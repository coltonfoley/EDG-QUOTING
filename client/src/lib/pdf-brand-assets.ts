let cachedCover: string | null = null;
let cachedLogo: string | null = null;
let cachedBack: string | null = null;

const FALLBACK_WHITE_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lD8l5wAAAABJRU5ErkJggg==";

function isUsableFetchedBrandAsset(dataUri: unknown): dataUri is string {
  return typeof dataUri === "string" &&
    /^data:image\/(png|jpeg|jpg);base64,/i.test(dataUri) &&
    dataUri.length > 300;
}

async function fetchBrandAsset(filename: string): Promise<string> {
  const response = await fetch(`/api/brand-assets/${filename}`);
  if (!response.ok) {
    return FALLBACK_WHITE_PNG;
  }

  try {
    const data = await response.json();
    return isUsableFetchedBrandAsset(data.dataUri) ? data.dataUri : FALLBACK_WHITE_PNG;
  } catch {
    return FALLBACK_WHITE_PNG;
  }
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
