import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Edit3, Loader2, FileText, AlertCircle, CheckCircle, Star, Users, Briefcase, Settings, Clock, DollarSign, Image as ImageIcon } from "lucide-react";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import type { QuoteWithDetails, ProposalTemplate } from "@shared/schema";
import logoPath from "@assets/my-logo.png_1753970984943.jpg";

// Import template renderers
import { BasicQuoteTemplate } from "./template-renderers/basic-quote-template";
import { FullProposalTemplate } from "./template-renderers/full-proposal-template";
import { ExecutiveSummaryTemplate } from "./template-renderers/executive-summary-template";
import { TechnicalSpecTemplate } from "./template-renderers/technical-spec-template";

interface QuotePDFTemplateProps {
  quote: QuoteWithDetails;
  isOpen: boolean;
  onClose: () => void;
}

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  license: string;
  logo?: string;
  customerName: string;
  customerCompany: string;
  customerEmail: string;
  customerPhone: string;
}

export function QuotePDFTemplate({ quote, isOpen, onClose }: QuotePDFTemplateProps) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [showTemplateSelection, setShowTemplateSelection] = useState(true);
  const [imageLoadingProgress, setImageLoadingProgress] = useState(0);
  const [imageLoadingStatus, setImageLoadingStatus] = useState<'idle' | 'loading' | 'complete' | 'error'>('idle');
  const [imageLoadingDetails, setImageLoadingDetails] = useState('');
  
  // Fetch proposal templates with proper typing
  const { data: proposalTemplates, isLoading: templatesLoading, error: templatesError } = useQuery<ProposalTemplate[]>({
    queryKey: ["/api/proposal-templates"],
    enabled: isOpen,
  });
  
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "EDG Patio & Shade",
    address: "123 Patio Drive, Shade City, SC 12345",
    phone: "(555) 123-4567",
    email: "info@edgpatioandshade.com",
    license: "License #SC-12345",
    customerName: quote.customer.name,
    customerCompany: quote.customer.company ?? "",
    customerEmail: quote.customer.email,
    customerPhone: quote.customer.phone,
  });

  const [quoteTerms, setQuoteTerms] = useState({
    validFor: "30 days",
    paymentTerms: "50% deposit, 50% on completion",
    warranty: "1 year limited warranty on workmanship",
    additionalNotes: "Materials subject to availability. Permit costs not included.",
  });

  const totals = calculateQuoteTotals(
    quote.lineItems.map(item => ({
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      markupType: item.markupType,
      markupValue: item.markupValue,
    })),
    quote.taxRate ?? 0,
    quote.discount ?? 0
  );

  // Helper functions for smart template selection
  const getQuoteComplexity = (quote: QuoteWithDetails) => {
    const lineItemCount = quote.lineItems.length;
    const totalValue = totals.total;
    const hasProjectDetails = quote.projectName || quote.projectAddress || quote.notes;
    
    if (lineItemCount > 10 || totalValue > 50000 || hasProjectDetails) {
      return 'complex';
    } else if (lineItemCount > 5 || totalValue > 10000) {
      return 'moderate';
    }
    return 'simple';
  };

  const getRecommendedTemplate = (templates: ProposalTemplate[], quote: QuoteWithDetails) => {
    const complexity = getQuoteComplexity(quote);
    
    // Priority order for recommendations
    const recommendationMap = {
      simple: ['basic_quote', 'executive_summary'],
      moderate: ['full_proposal', 'basic_quote', 'executive_summary'],
      complex: ['full_proposal', 'technical_spec', 'executive_summary']
    };
    
    const preferredCategories = recommendationMap[complexity];
    
    for (const category of preferredCategories) {
      const template = templates.find(t => t.category === category && t.isActive);
      if (template) return template;
    }
    
    return templates.find(t => t.isDefault) || templates[0];
  };

  const getStorageKey = (quoteId: number) => `quote-template-${quoteId}`;

  // Get templates array and handle smart selection
  const templatesArray = proposalTemplates || [];
  
  // Auto-select template when templates load
  useEffect(() => {
    if (!templatesArray.length || selectedTemplateId) return;
    
    // First, try to get last used template for this quote from localStorage
    const savedTemplateId = localStorage.getItem(getStorageKey(quote.id));
    if (savedTemplateId) {
      const savedTemplate = templatesArray.find(t => t.id.toString() === savedTemplateId);
      if (savedTemplate && savedTemplate.isActive) {
        setSelectedTemplateId(savedTemplateId);
        return;
      }
    }
    
    // Fall back to recommended template
    const recommended = getRecommendedTemplate(templatesArray, quote);
    if (recommended) {
      setSelectedTemplateId(recommended.id.toString());
    }
  }, [templatesArray, quote.id, selectedTemplateId]);

  // Save template selection to localStorage
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplateId(templateId);
    localStorage.setItem(getStorageKey(quote.id), templateId);
    if (showTemplateSelection) {
      setShowTemplateSelection(false);
    }
  };

  const selectedTemplate = templatesArray.find(
    (t) => t.id.toString() === selectedTemplateId
  ) || templatesArray.find((t) => t.isDefault) || templatesArray[0];

  // Template information helpers
  const getTemplateIcon = (category: string) => {
    switch (category) {
      case 'basic_quote': return FileText;
      case 'full_proposal': return Briefcase;
      case 'executive_summary': return Users;
      case 'technical_spec': return Settings;
      default: return FileText;
    }
  };

  const getTemplateUseCase = (category: string) => {
    switch (category) {
      case 'basic_quote': return 'Simple quotes with essential details';
      case 'full_proposal': return 'Comprehensive proposals with detailed scope';
      case 'executive_summary': return 'High-level overviews for decision makers';
      case 'technical_spec': return 'Detailed technical specifications';
      default: return 'General purpose template';
    }
  };

  const getTemplateBadgeColor = (category: string) => {
    switch (category) {
      case 'basic_quote': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'full_proposal': return 'bg-green-100 text-green-800 border-green-200';
      case 'executive_summary': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'technical_spec': return 'bg-orange-100 text-orange-800 border-orange-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const isRecommendedTemplate = (template: ProposalTemplate) => {
    const recommended = getRecommendedTemplate(templatesArray, quote);
    return recommended?.id === template.id;
  };

  // Image processing utilities for PDF generation
  const convertImageToDataURL = async (imageUrl: string, timeoutMs = 10000): Promise<string | null> => {
    try {
      // Handle blob URLs and data URLs directly
      if (imageUrl.startsWith('blob:') || imageUrl.startsWith('data:')) {
        return imageUrl;
      }

      console.log('🔧 Attempting to convert image to DataURL:', imageUrl);

      // Use backend proxy for object storage URLs (bypasses CORS)
      if (imageUrl.includes('storage.replit.com')) {
        try {
          console.log('🔄 Using backend proxy for Replit storage URL');
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), timeoutMs);
          
          const proxyUrl = `/api/image-proxy?url=${encodeURIComponent(imageUrl)}`;
          const response = await fetch(proxyUrl, { 
            signal: controller.signal
          });
          clearTimeout(timeout);
          
          if (!response.ok) {
            throw new Error(`Proxy error ${response.status}: ${response.statusText}`);
          }
          
          const blob = await response.blob();
          
          return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              console.log('✅ Successfully converted via proxy:', imageUrl, `(${Math.round((reader.result as string).length / 1024)}KB)`);
              resolve(reader.result as string);
            };
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsDataURL(blob);
          });
        } catch (proxyError) {
          console.warn('❌ Proxy approach failed:', proxyError);
          // Fall through to Image element approach
        }
      }

      // Fallback to Image element approach
      console.log('🖼️ Using Image element approach');
      return new Promise((resolve, reject) => {
        const img = new Image();
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Set up timeout
        const timeout = setTimeout(() => {
          console.error('⏰ Image loading timeout:', imageUrl);
          reject(new Error(`Image loading timeout: ${imageUrl}`));
        }, timeoutMs);

        img.onload = () => {
          clearTimeout(timeout);
          console.log('✅ Image loaded successfully:', imageUrl, `(${img.naturalWidth}x${img.naturalHeight})`);
          try {
            // Set canvas size to image size for best quality
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            
            // Draw image on canvas
            ctx?.drawImage(img, 0, 0);
            
            // Convert to high-quality JPEG for smaller file size in PDF
            const dataURL = canvas.toDataURL('image/jpeg', 0.92);
            console.log('✅ Successfully converted to DataURL:', imageUrl, `(${Math.round(dataURL.length / 1024)}KB)`);
            resolve(dataURL);
          } catch (canvasError) {
            console.error('❌ Canvas conversion failed:', imageUrl, canvasError);
            resolve(null);
          }
        };

        img.onerror = (error) => {
          clearTimeout(timeout);
          console.error('❌ Image loading failed:', imageUrl, error);
          resolve(null);
        };

        // Enable CORS for cross-origin images
        img.crossOrigin = 'anonymous';
        img.src = imageUrl;
      });
    } catch (error) {
      console.error('❌ Error processing image:', imageUrl, error);
      return null;
    }
  };

  const extractImageUrlsFromElement = (element: HTMLElement): string[] => {
    const images = element.querySelectorAll('img');
    const urls = new Set<string>();
    
    images.forEach(img => {
      if (img.src && !img.src.startsWith('data:')) {
        urls.add(img.src);
      }
    });
    
    return Array.from(urls);
  };

  const preloadAndConvertImages = async (imageUrls: string[]): Promise<Map<string, string>> => {
    const imageDataMap = new Map<string, string>();
    
    if (imageUrls.length === 0) {
      return imageDataMap;
    }

    setImageLoadingStatus('loading');
    setImageLoadingProgress(0);
    setImageLoadingDetails(`Loading ${imageUrls.length} images...`);

    const promises = imageUrls.map(async (url, index) => {
      try {
        setImageLoadingDetails(`Loading image ${index + 1} of ${imageUrls.length}...`);
        const dataURL = await convertImageToDataURL(url);
        
        if (dataURL) {
          imageDataMap.set(url, dataURL);
        }
        
        // Update progress
        const progress = ((index + 1) / imageUrls.length) * 100;
        setImageLoadingProgress(progress);
        
        return { url, dataURL };
      } catch (error) {
        console.warn(`Failed to load image ${url}:`, error);
        return { url, dataURL: null };
      }
    });

    try {
      await Promise.allSettled(promises);
      setImageLoadingStatus('complete');
      setImageLoadingDetails(`Successfully loaded ${imageDataMap.size} of ${imageUrls.length} images`);
    } catch (error) {
      setImageLoadingStatus('error');
      setImageLoadingDetails('Some images failed to load');
      console.error('Error loading images:', error);
    }

    return imageDataMap;
  };

  const replaceImageSourcesInElement = (element: HTMLElement, imageDataMap: Map<string, string>): void => {
    const images = element.querySelectorAll('img');
    
    images.forEach(img => {
      const originalSrc = img.src;
      
      // Replace with data URL if available
      if (imageDataMap.has(originalSrc)) {
        const dataURL = imageDataMap.get(originalSrc);
        if (dataURL) {
          img.src = dataURL;
        }
      }
      // Special handling for logo path
      else if (originalSrc.includes('my-logo')) {
        // This will be handled separately as before
      }
    });
  };
  
  // Render the appropriate template component
  const renderTemplate = () => {
    if (!selectedTemplate) return null;
    
    const templateProps = {
      quote,
      template: selectedTemplate,
      companyInfo,
      quoteTerms,
    };
    
    switch (selectedTemplate.category) {
      case 'basic_quote':
        return <BasicQuoteTemplate {...templateProps} />;
      case 'full_proposal':
        return <FullProposalTemplate {...templateProps} />;
      case 'executive_summary':
        return <ExecutiveSummaryTemplate {...templateProps} />;
      case 'technical_spec':
        return <TechnicalSpecTemplate {...templateProps} />;
      default:
        return <BasicQuoteTemplate {...templateProps} />;
    }
  };

  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      try {
        // Reset loading states
        setImageLoadingStatus('loading');
        setImageLoadingProgress(0);
        setImageLoadingDetails('Preparing PDF generation...');

        const element = document.getElementById('quote-pdf-content');
        if (!element) throw new Error('PDF content not found');

        // Extract all image URLs from the template
        const imageUrls = extractImageUrlsFromElement(element);
        
        // Pre-load and convert all images to data URLs
        const imageDataMap = await preloadAndConvertImages(imageUrls);
        
        setImageLoadingDetails('Processing document...');

        // Create a clone of the element for processing
        const elementClone = element.cloneNode(true) as HTMLElement;
        
        // Replace all image sources with data URLs
        replaceImageSourcesInElement(elementClone, imageDataMap);
        
        // Handle company logo separately (as before)
        let logoDataUrl = '';
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          const img = new Image();
          
          await new Promise((resolve, reject) => {
            img.onload = () => {
              canvas.width = img.width;
              canvas.height = img.height;
              ctx?.drawImage(img, 0, 0);
              logoDataUrl = canvas.toDataURL('image/png');
              resolve(logoDataUrl);
            };
            img.onerror = reject;
            img.src = logoPath;
          });
        } catch (error) {
          console.warn('Failed to load logo for PDF:', error);
        }

        // Replace logo images that use the asset logo
        if (logoDataUrl) {
          const logoImgs = elementClone.querySelectorAll('img');
          logoImgs.forEach((logoImg) => {
            if (logoImg.src.includes('my-logo')) {
              logoImg.src = logoDataUrl;
            }
          });
        }

        setImageLoadingDetails('Applying styles...');

        // Copy all stylesheets from current document
        let allStyles = '';
        
        // Get all style and link elements from the current document
        const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
        for (const styleEl of Array.from(styleElements)) {
          if (styleEl.tagName === 'STYLE') {
            allStyles += styleEl.outerHTML;
          } else if (styleEl.tagName === 'LINK') {
            // For external stylesheets, try to fetch and inline them
            try {
              const href = (styleEl as HTMLLinkElement).href;
              if (href) {
                const response = await fetch(href);
                const cssText = await response.text();
                allStyles += `<style>${cssText}</style>`;
              }
            } catch (error) {
              // If we can't fetch external CSS, just copy the link tag
              allStyles += styleEl.outerHTML;
            }
          }
        }

        setImageLoadingDetails('Opening print dialog...');

        // Open print window
        const printWindow = window.open('', '_blank');
        if (!printWindow) throw new Error('Could not open print window');

        // Create a complete HTML document for printing
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>${selectedTemplate?.name || 'Quote'}-${quote.quoteNumber}</title>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            ${allStyles}
            <style>
              /* Print-specific overrides */
              @media print {
                @page { 
                  size: A4; 
                  margin: 20mm; 
                }
                .page-break-before { page-break-before: always; }
                .page-break-after { page-break-after: always; }
                .page-break-avoid { page-break-inside: avoid; }
                .no-break { break-inside: avoid; }
                .signature-section { 
                  break-inside: avoid; 
                  min-height: 200px;
                  page-break-inside: avoid;
                }
                .contract-terms {
                  break-inside: auto;
                  page-break-inside: auto;
                }
                
                /* Ensure images print at good quality */
                img {
                  max-width: 100% !important;
                  height: auto !important;
                  page-break-inside: avoid;
                  image-rendering: -webkit-optimize-contrast;
                  image-rendering: crisp-edges;
                }
              }
              
              /* Ensure consistent font rendering in print */
              body { 
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                color: #000;
                background: white;
              }
              
              /* Image quality optimizations */
              img {
                image-rendering: -webkit-optimize-contrast;
                image-rendering: crisp-edges;
                image-rendering: pixelated;
              }
            </style>
          </head>
          <body>
            ${elementClone.outerHTML}
            <script>
              window.onload = function() {
                // Small delay to ensure all images are rendered
                setTimeout(function() {
                  window.print();
                  setTimeout(function() {
                    window.close();
                  }, 1000);
                }, 500);
              };
            </script>
          </body>
          </html>
        `);
        
        printWindow.document.close();
        
        // Reset states
        setImageLoadingStatus('idle');
        setImageLoadingProgress(0);
        setImageLoadingDetails('');
        
      } catch (error) {
        setImageLoadingStatus('error');
        setImageLoadingDetails('Failed to generate PDF');
        throw error;
      }
    },
    onSuccess: () => {
      toast({ 
        title: "PDF Generated", 
        description: "Print dialog opened - save as PDF to download" 
      });
    },
    onError: (error) => {
      console.error('PDF generation error:', error);
      toast({ 
        title: "Error", 
        description: "Failed to generate PDF. Please try again.", 
        variant: "destructive" 
      });
      setImageLoadingStatus('idle');
      setImageLoadingProgress(0);
      setImageLoadingDetails('');
    },
  });

  const handleDownload = () => {
    generatePDFMutation.mutate();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle>
              {showTemplateSelection ? "Select Template" : selectedTemplate?.name || "Quote PDF Template"}
              {selectedTemplate && !showTemplateSelection && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({selectedTemplate.description})
                </span>
              )}
            </DialogTitle>
            <div className="flex space-x-2">
              {!showTemplateSelection && (
                <Button
                  variant="outline"
                  onClick={() => setShowTemplateSelection(true)}
                  className="border-gray-300 text-gray-700 hover:bg-gray-50"
                  data-testid="button-change-template"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Change Template
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="border-edg-teal text-edg-teal hover:bg-edg-light-teal hover:bg-opacity-10"
                data-testid="button-edit-template"
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {isEditing ? "View" : "Edit"} Template
              </Button>
              <Button
                onClick={handleDownload}
                disabled={generatePDFMutation.isPending || !selectedTemplate || showTemplateSelection || imageLoadingStatus === 'loading'}
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
                data-testid="button-download-pdf"
              >
                {generatePDFMutation.isPending || imageLoadingStatus === 'loading' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {imageLoadingStatus === 'loading' ? 'Processing Images...' : 'Opening Print Dialog...'}
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    Print / Save as PDF
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {templatesError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load templates. Please try again.
            </AlertDescription>
          </Alert>
        )}

        {/* Image Loading Progress Indicator */}
        {imageLoadingStatus === 'loading' && (
          <Alert className="mb-4">
            <ImageIcon className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium">Processing Images for PDF</span>
                  <span className="text-sm text-gray-600">{Math.round(imageLoadingProgress)}%</span>
                </div>
                <Progress value={imageLoadingProgress} className="w-full" />
                <p className="text-sm text-gray-600">{imageLoadingDetails}</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {imageLoadingStatus === 'error' && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-1">
                <p className="font-medium">Image Processing Error</p>
                <p className="text-sm">{imageLoadingDetails}</p>
                <p className="text-sm">PDF generation will continue with available images.</p>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {imageLoadingStatus === 'complete' && imageLoadingDetails && (
          <Alert className="mb-4">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="flex items-center justify-between">
                <span className="font-medium">Images Ready</span>
                <span className="text-sm text-gray-600">{imageLoadingDetails}</span>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {showTemplateSelection ? (
          <div className="space-y-6 p-6">
            {/* Quote info and recommendation */}
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-blue-900 mb-2" data-testid="text-quote-info">
                    Quote {quote.quoteNumber} - {formatCurrency(totals.total)}
                  </h3>
                  <div className="text-sm text-blue-700 space-y-1">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center">
                        <FileText className="h-4 w-4 mr-1" />
                        {quote.lineItems.length} line {quote.lineItems.length === 1 ? 'item' : 'items'}
                      </span>
                      <span className="flex items-center">
                        <Users className="h-4 w-4 mr-1" />
                        {quote.customer.name}
                      </span>
                      {quote.projectName && (
                        <span className="flex items-center">
                          <Briefcase className="h-4 w-4 mr-1" />
                          {quote.projectName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Badge className="bg-blue-100 text-blue-800 border-blue-200" data-testid="badge-complexity">
                  {getQuoteComplexity(quote)} quote
                </Badge>
              </div>
            </div>

            {/* Template cards grid */}
            {templatesLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {[...Array(4)].map((_, i) => (
                  <Card key={i} className="p-4">
                    <Skeleton className="h-24 w-full mb-4" />
                    <Skeleton className="h-4 w-3/4 mb-2" />
                    <Skeleton className="h-3 w-full" />
                  </Card>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templatesArray.filter(t => t.isActive).map((template) => {
                  const IconComponent = getTemplateIcon(template.category);
                  const isRecommended = isRecommendedTemplate(template);
                  const isSelected = selectedTemplateId === template.id.toString();
                  
                  return (
                    <Card 
                      key={template.id} 
                      className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 ${
                        isSelected 
                          ? 'border-edg-teal bg-edg-light-teal/5 shadow-md' 
                          : isRecommended 
                            ? 'border-blue-300 bg-blue-50/50' 
                            : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => handleTemplateSelect(template.id.toString())}
                      data-testid={`card-template-${template.category}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex items-start space-x-3">
                            <div className={`p-2 rounded-lg ${
                              isSelected 
                                ? 'bg-edg-teal text-white' 
                                : 'bg-gray-100 text-gray-600'
                            }`}>
                              <IconComponent className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-lg">{template.name}</h4>
                                {isRecommended && (
                                  <div className="flex items-center">
                                    <Star className="h-4 w-4 text-amber-500 fill-current" />
                                    <Badge className="ml-1 bg-amber-100 text-amber-800 border-amber-200 text-xs">
                                      Recommended
                                    </Badge>
                                  </div>
                                )}
                                {template.isDefault && (
                                  <Badge variant="outline" className="text-xs">Default</Badge>
                                )}
                              </div>
                              <Badge className={`text-xs ${getTemplateBadgeColor(template.category)}`}>
                                {template.category.replace('_', ' ').toUpperCase()}
                              </Badge>
                            </div>
                          </div>
                          {isSelected && (
                            <CheckCircle className="h-5 w-5 text-edg-teal" />
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <p className="text-gray-600 text-sm mb-3">
                          {template.description || getTemplateUseCase(template.category)}
                        </p>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex items-center">
                            <Clock className="h-3 w-3 mr-1" />
                            <span>{getTemplateUseCase(template.category)}</span>
                          </div>
                          {isRecommended && (
                            <div className="flex items-center text-amber-600">
                              <Star className="h-3 w-3 mr-1" />
                              <span>Best fit for this quote</span>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={() => setShowTemplateSelection(false)}
                disabled={!selectedTemplateId}
                className="bg-edg-black hover:bg-edg-grey text-edg-white px-8"
                data-testid="button-continue-template"
              >
                {selectedTemplateId ? 'Continue with Template' : 'Select a Template'}
              </Button>
            </div>
          </div>
        ) : isEditing ? (
          <div className="space-y-6 p-4">
            <Card>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold mb-4">Company Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="companyName">Company Name</Label>
                    <Input
                      id="companyName"
                      value={companyInfo.name}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={companyInfo.phone}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, phone: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      value={companyInfo.email}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="license">License Number</Label>
                    <Input
                      id="license"
                      value={companyInfo.license}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, license: e.target.value })}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <Label htmlFor="address">Address</Label>
                    <Textarea
                      id="address"
                      value={companyInfo.address}
                      onChange={(e) => setCompanyInfo({ ...companyInfo, address: e.target.value })}
                      rows={2}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold mb-4">Customer Information</h3>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="customerName" className="text-sm font-medium">Customer Name</Label>
                    <Input
                      id="customerName"
                      value={companyInfo.customerName}
                      onChange={(e) => setCompanyInfo({...companyInfo, customerName: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerCompany" className="text-sm font-medium">Company (Optional)</Label>
                    <Input
                      id="customerCompany"
                      value={companyInfo.customerCompany || ""}
                      onChange={(e) => setCompanyInfo({...companyInfo, customerCompany: e.target.value})}
                      className="mt-1"
                      placeholder="Company name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerEmail" className="text-sm font-medium">Customer Email</Label>
                    <Input
                      id="customerEmail"
                      value={companyInfo.customerEmail}
                      onChange={(e) => setCompanyInfo({...companyInfo, customerEmail: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="customerPhone" className="text-sm font-medium">Customer Phone</Label>
                    <Input
                      id="customerPhone"
                      value={companyInfo.customerPhone}
                      onChange={(e) => setCompanyInfo({...companyInfo, customerPhone: e.target.value})}
                      className="mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold mb-4">Quote Terms</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="validFor">Valid For</Label>
                    <Input
                      id="validFor"
                      value={quoteTerms.validFor}
                      onChange={(e) => setQuoteTerms({ ...quoteTerms, validFor: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="paymentTerms">Payment Terms</Label>
                    <Input
                      id="paymentTerms"
                      value={quoteTerms.paymentTerms}
                      onChange={(e) => setQuoteTerms({ ...quoteTerms, paymentTerms: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="warranty">Warranty</Label>
                    <Input
                      id="warranty"
                      value={quoteTerms.warranty}
                      onChange={(e) => setQuoteTerms({ ...quoteTerms, warranty: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="additionalNotes">Additional Notes</Label>
                    <Textarea
                      id="additionalNotes"
                      value={quoteTerms.additionalNotes}
                      onChange={(e) => setQuoteTerms({ ...quoteTerms, additionalNotes: e.target.value })}
                      rows={3}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
          <div id="quote-pdf-content" style={{ minHeight: '297mm' }}>
            {templatesLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <div>Loading templates...</div>
                </div>
              </div>
            ) : !selectedTemplate ? (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <div className="text-lg font-medium mb-2">No Template Selected</div>
                  <div className="text-gray-600">Please select a template to preview your quote</div>
                </div>
              </div>
            ) : (
              renderTemplate()
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}