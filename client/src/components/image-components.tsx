import { 
  ProjectImage, 
  PortfolioImage, 
  TechnicalDiagram, 
  CompanyImage, 
  ProductImage 
} from "@shared/schema";

interface ImageDisplayProps {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  style?: React.CSSProperties;
}

// Single professional image with caption
export function ProfessionalImage({ src, alt, caption, className, style }: ImageDisplayProps) {
  return (
    <div className={`mb-4 ${className || ''}`} style={style}>
      <img 
        src={src} 
        alt={alt} 
        className="w-full h-auto object-cover rounded shadow-sm border border-gray-200"
        style={{ 
          maxHeight: '300px',
          ...style 
        }} 
      />
      {caption && (
        <p className="text-xs text-gray-600 mt-2 italic text-center">{caption}</p>
      )}
    </div>
  );
}

interface ImageGridProps {
  images: (ProjectImage | PortfolioImage | TechnicalDiagram | CompanyImage | ProductImage)[];
  columns?: number;
  maxImages?: number;
  showCaptions?: boolean;
  className?: string;
}

// Professional image grid for multiple images
export function ImageGrid({ 
  images, 
  columns = 2, 
  maxImages = 6, 
  showCaptions = true, 
  className 
}: ImageGridProps) {
  const displayImages = images.slice(0, maxImages);
  
  if (displayImages.length === 0) return null;
  
  const gridCols = columns === 3 ? 'grid-cols-3' : columns === 4 ? 'grid-cols-4' : 'grid-cols-2';
  
  return (
    <div className={`grid ${gridCols} gap-3 mb-6 ${className || ''}`}>
      {displayImages.map((image, index) => (
        <div key={index} className="text-center">
          <img 
            src={image.url} 
            alt={image.altText || `Image ${index + 1}`}
            className="w-full h-32 object-cover rounded shadow-sm border border-gray-200"
          />
          {showCaptions && image.caption && (
            <p className="text-xs text-gray-600 mt-1 italic">{image.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}

interface HeroImageProps {
  image: ProjectImage | PortfolioImage;
  title?: string;
  subtitle?: string;
  overlay?: boolean;
  height?: string;
}

// Hero image for cover pages and headers
export function HeroImage({ 
  image, 
  title, 
  subtitle, 
  overlay = true, 
  height = '300px' 
}: HeroImageProps) {
  return (
    <div 
      className="relative w-full rounded-lg overflow-hidden shadow-lg mb-6"
      style={{ height }}
    >
      <img 
        src={image.url}
        alt={image.altText || title || 'Hero image'}
        className="w-full h-full object-cover"
      />
      {overlay && (title || subtitle) && (
        <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center">
          <div className="text-center text-white">
            {title && <h2 className="text-2xl font-bold mb-2">{title}</h2>}
            {subtitle && <p className="text-lg">{subtitle}</p>}
          </div>
        </div>
      )}
      {image.caption && (
        <p className="text-xs text-gray-600 mt-2 italic text-center">{image.caption}</p>
      )}
    </div>
  );
}

interface TechnicalDiagramDisplayProps {
  diagrams: TechnicalDiagram[];
  layout?: 'single' | 'grid' | 'stack';
  showLabels?: boolean;
}

// Specialized display for technical diagrams
export function TechnicalDiagramDisplay({ 
  diagrams, 
  layout = 'grid', 
  showLabels = true 
}: TechnicalDiagramDisplayProps) {
  if (diagrams.length === 0) return null;

  if (layout === 'single' && diagrams.length > 0) {
    const diagram = diagrams[0];
    return (
      <div className="mb-6 text-center">
        <img 
          src={diagram.url}
          alt={diagram.altText || `${diagram.diagramType} diagram`}
          className="max-w-full h-auto rounded border border-gray-300 shadow-sm mx-auto"
          style={{ maxHeight: '400px' }}
        />
        {showLabels && (
          <div className="mt-2">
            <p className="text-sm font-semibold text-gray-700 capitalize">
              {diagram.diagramType} Diagram
            </p>
            {diagram.caption && (
              <p className="text-xs text-gray-600 italic">{diagram.caption}</p>
            )}
          </div>
        )}
      </div>
    );
  }

  if (layout === 'stack') {
    return (
      <div className="space-y-4 mb-6">
        {diagrams.map((diagram, index) => (
          <div key={index} className="text-center">
            <img 
              src={diagram.url}
              alt={diagram.altText || `${diagram.diagramType} diagram`}
              className="max-w-full h-auto rounded border border-gray-300 shadow-sm mx-auto"
              style={{ maxHeight: '300px' }}
            />
            {showLabels && (
              <div className="mt-2">
                <p className="text-sm font-semibold text-gray-700 capitalize">
                  {diagram.diagramType} Diagram
                </p>
                {diagram.caption && (
                  <p className="text-xs text-gray-600 italic">{diagram.caption}</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Grid layout
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      {diagrams.map((diagram, index) => (
        <div key={index} className="text-center">
          <img 
            src={diagram.url}
            alt={diagram.altText || `${diagram.diagramType} diagram`}
            className="w-full h-40 object-contain rounded border border-gray-300 shadow-sm"
          />
          {showLabels && (
            <div className="mt-2">
              <p className="text-xs font-semibold text-gray-700 capitalize">
                {diagram.diagramType}
              </p>
              {diagram.caption && (
                <p className="text-xs text-gray-600 italic">{diagram.caption}</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

interface CompanyImageDisplayProps {
  images: CompanyImage[];
  type: 'logo' | 'team' | 'facility' | 'certification' | 'other';
  layout?: 'inline' | 'grid' | 'banner';
}

// Specialized display for company images
export function CompanyImageDisplay({ 
  images, 
  type, 
  layout = 'grid' 
}: CompanyImageDisplayProps) {
  const filteredImages = images.filter(img => img.imageType === type);
  
  if (filteredImages.length === 0) return null;

  if (type === 'logo' && layout === 'inline') {
    const logo = filteredImages[0];
    return (
      <img 
        src={logo.url}
        alt={logo.altText || 'Company logo'}
        className="h-12 w-auto object-contain"
      />
    );
  }

  if (layout === 'banner') {
    return (
      <div className="flex justify-center space-x-4 mb-6">
        {filteredImages.slice(0, 4).map((image, index) => (
          <img 
            key={index}
            src={image.url}
            alt={image.altText || `${type} image`}
            className="h-20 w-auto object-contain rounded shadow-sm"
          />
        ))}
      </div>
    );
  }

  // Grid layout
  const gridCols = filteredImages.length === 1 ? 'grid-cols-1' : 
                   filteredImages.length === 2 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className={`grid ${gridCols} gap-4 mb-6 justify-items-center`}>
      {filteredImages.map((image, index) => (
        <div key={index} className="text-center">
          <img 
            src={image.url}
            alt={image.altText || `${type} image`}
            className={`object-contain rounded shadow-sm ${
              type === 'certification' ? 'h-24 w-auto' : 'h-32 w-32'
            }`}
          />
          {image.caption && (
            <p className="text-xs text-gray-600 mt-1 italic">{image.caption}</p>
          )}
        </div>
      ))}
    </div>
  );
}

interface ProjectPhaseDisplayProps {
  images: ProjectImage[];
  showPhases?: boolean;
}

// Display project images organized by phase
export function ProjectPhaseDisplay({ 
  images, 
  showPhases = true 
}: ProjectPhaseDisplayProps) {
  if (images.length === 0) return null;

  if (!showPhases) {
    return <ImageGrid images={images} columns={3} maxImages={6} />;
  }

  const phases = ['before', 'during', 'after', 'other'] as const;
  const imagesByPhase = phases.reduce((acc, phase) => {
    acc[phase] = images.filter(img => img.category === phase);
    return acc;
  }, {} as Record<typeof phases[number], ProjectImage[]>);

  return (
    <div className="space-y-6">
      {phases.map(phase => {
        const phaseImages = imagesByPhase[phase];
        if (phaseImages.length === 0) return null;
        
        return (
          <div key={phase} className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 capitalize border-b border-gray-200 pb-1">
              {phase} {phase !== 'other' ? 'Project' : 'Images'}
            </h4>
            <ImageGrid 
              images={phaseImages} 
              columns={3} 
              maxImages={3}
              showCaptions={true}
            />
          </div>
        );
      })}
    </div>
  );
}

// Helper function to get the best image for a specific purpose
export function getBestImage(
  images: (ProjectImage | PortfolioImage)[], 
  preference: string[] = ['featured', 'before', 'after']
): ProjectImage | PortfolioImage | null {
  if (images.length === 0) return null;
  
  // First try to find a featured portfolio image
  const featured = images.find(img => 
    'featured' in img && img.featured
  );
  if (featured) return featured;
  
  // Then try categories in order of preference
  for (const pref of preference) {
    const match = images.find(img => 
      'category' in img && img.category === pref
    );
    if (match) return match;
  }
  
  // Fall back to first image
  return images[0];
}

// Helper function to safely get company logo
export function getCompanyLogo(companyImages: CompanyImage[]): CompanyImage | null {
  return companyImages.find(img => img.imageType === 'logo') || null;
}