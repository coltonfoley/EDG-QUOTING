// Brand assets for Branded Sequence PDF generation

// Brand cover image - EDG Patio & Shade cover photo
export const BRAND_COVER_JPG = `TYPESCRIPT_FILE
cat /tmp/new_cover_base64.txt | sed 's/^/data:image\/png;base64,/' >> client/src/lib/pdf-brand-assets.ts
cat <<'TYPESCRIPT_FILE' >> client/src/lib/pdf-brand-assets.ts
`;

// EDG Logo - Full color with teal accents  
export const BRAND_LOGO_PNG = `TYPESCRIPT_FILE
cat /tmp/logo_base64.txt >> client/src/lib/pdf-brand-assets.ts
cat <<'TYPESCRIPT_FILE' >> client/src/lib/pdf-brand-assets.ts
`;

// Back page image - EDG branded back page
export const BRAND_BACK_PAGE_PNG = `TYPESCRIPT_FILE
cat /tmp/back_base64.txt >> client/src/lib/pdf-brand-assets.ts
cat <<'TYPESCRIPT_FILE' >> client/src/lib/pdf-brand-assets.ts
`;
