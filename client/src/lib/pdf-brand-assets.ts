let cachedCover: string | null = null;
let cachedLogo: string | null = null;
let cachedBack: string | null = null;

export async function getBrandCoverJPG(): Promise<string> {
  if (!cachedCover) {
    const { BRAND_COVER_JPG } = await import('./brand-asset-cover');
    cachedCover = BRAND_COVER_JPG;
  }
  return cachedCover;
}

export async function getBrandLogoPNG(): Promise<string> {
  if (!cachedLogo) {
    const { BRAND_LOGO_PNG } = await import('./brand-asset-logo');
    cachedLogo = BRAND_LOGO_PNG;
  }
  return cachedLogo;
}

export async function getBrandBackPagePNG(): Promise<string> {
  if (!cachedBack) {
    const { BRAND_BACK_PAGE_PNG } = await import('./brand-asset-back');
    cachedBack = BRAND_BACK_PAGE_PNG;
  }
  return cachedBack;
}
