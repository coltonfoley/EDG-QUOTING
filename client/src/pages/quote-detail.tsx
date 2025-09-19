import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { LoadingSpinner } from "@/components/loading-spinner";
import { useToast } from "@/hooks/use-toast";
import { 
  ArrowLeft, 
  Edit, 
  Download, 
  Mail, 
  Phone, 
  Building2,
  Calendar,
  DollarSign,
  FileText,
  User,
  Settings,
  ImageIcon,
  Eye,
  EyeOff,
  Info,
  Loader2,
} from "lucide-react";
import { ImageUpload } from "@/components/image-upload";
import { format } from "date-fns";
import type { QuoteWithDetails } from "@shared/schema";
import { companySettings as companySettingsTable } from "@shared/schema";

export default function QuoteDetail() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const quoteId = id ? parseInt(id) : undefined;
  const { toast } = useToast();

  // PDF Options State Management
  const [pdfOptions, setPdfOptions] = useState({
    brandedCover: true,
    productRenderings: true,
    showPricing: true,
  });

  // Load saved preferences from localStorage
  useEffect(() => {
    if (quoteId) {
      const savedOptions = localStorage.getItem(`pdf-options-${quoteId}`);
      if (savedOptions) {
        try {
          setPdfOptions(JSON.parse(savedOptions));
        } catch (error) {
          console.warn('Failed to load saved PDF options:', error);
        }
      }
    }
  }, [quoteId]);

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (quoteId) {
      localStorage.setItem(`pdf-options-${quoteId}`, JSON.stringify(pdfOptions));
    }
  }, [pdfOptions, quoteId]);

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !!quoteId,
  });

  // Company settings query for dynamic branding
  const { data: settings } = useQuery<typeof companySettingsTable.$inferSelect>({
    queryKey: ["/api/company-settings"],
  });

  // HTML escape function to prevent XSS attacks
  const escapeHtml = (text: string | null | undefined) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  // CSS color validation function to prevent XSS injection
  const isValidCSSColor = (color: string): boolean => {
    // Allow hex colors (#RGB, #RRGGBB)
    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(color)) return true;
    // Allow rgb/rgba/hsl/hsla and named colors
    if (/^(rgb|rgba|hsl|hsla)\([^)]+\)$/.test(color)) return true;
    // Allow common color names
    const validNames = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'gray', 'grey', 'orange', 'purple', 'brown', 'pink', 'cyan', 'magenta', 'lime', 'indigo', 'violet', 'maroon', 'navy', 'olive', 'teal', 'silver', 'gold'];
    return validNames.includes(color.toLowerCase());
  };

  // Safe color function that validates and returns safe color or default
  const getSafeColor = (color: string | undefined | null, defaultColor: string = '#0066cc'): string => {
    if (!color || !isValidCSSColor(color)) {
      return defaultColor;
    }
    return color;
  };

  // Safe background color function for PDF generation
  const getBackgroundColor = (color: string): string => {
    if (/^#([0-9A-Fa-f]{3}){1,2}$/.test(color)) {
      // It's a hex color - handle both 3-digit and 6-digit
      let hexValue = color.replace('#', '');
      
      // Expand 3-digit hex to 6-digit (e.g., 'abc' -> 'aabbcc')
      if (hexValue.length === 3) {
        hexValue = hexValue.split('').map(char => char + char).join('');
      }
      
      // Convert to rgba
      const rgb = hexValue.match(/.{2}/g)?.map(x => parseInt(x, 16)).join(', ');
      return rgb ? `rgba(${rgb}, 0.05)` : 'rgba(0, 0, 0, 0.03)';
    }
    // Non-hex color - use safe fallback
    return 'rgba(0, 0, 0, 0.03)';
  };

  // PDF Generation mutation with simplified logic based on toggles
  const generatePDFMutation = useMutation({
    mutationFn: async (options: typeof pdfOptions) => {
      if (!quote) throw new Error('Quote data not available');
      if (!settings) throw new Error('Company settings not loaded');
      
      // Create a simple HTML structure based on the toggle options
      const generatePDFContent = () => {
        let htmlContent = '';
        
        // Add enhanced professional styles
        const primaryColor = getSafeColor(settings.primaryColor, '#0066cc');
        const accentColor = getSafeColor(settings.accentColor, '#10b981');
        const textColor = getSafeColor(settings.textColor, '#374151');
        
        htmlContent += `
          <style>
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
              line-height: 1.6;
              color: ${textColor};
              margin: 0;
              padding: 0;
              background: #ffffff;
            }
            
            /* Professional Cover Page Styles */
            .cover-page { 
              width: 100vw;
              height: 100vh;
              padding: 40px 60px;
              page-break-after: always; 
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              box-sizing: border-box;
              background: linear-gradient(135deg, #ffffff 0%, #f8fafc 100%);
            }
            
            .cover-header {
              display: flex;
              align-items: center;
              justify-content: space-between;
              padding-bottom: 30px;
              border-bottom: 3px solid ${primaryColor};
              margin-bottom: 40px;
            }
            
            .logo-section {
              display: flex;
              align-items: center;
              gap: 20px;
            }
            
            .company-logo {
              max-height: 80px;
              max-width: 120px;
              object-fit: contain;
            }
            
            .company-name {
              font-size: 32px;
              font-weight: 700;
              color: ${primaryColor};
              margin: 0;
              letter-spacing: -0.5px;
            }
            
            .contact-info {
              text-align: right;
              color: ${textColor};
              font-size: 14px;
              line-height: 1.8;
            }
            
            .contact-info strong {
              color: ${primaryColor};
              font-weight: 600;
            }
            
            .quote-header {
              text-align: center;
              margin: 60px 0;
              padding: 40px 0;
              background: ${getBackgroundColor(primaryColor)};
              border-radius: 12px;
              border: 2px solid ${accentColor};
            }
            
            .construction-quote-title {
              font-size: 28px;
              font-weight: 800;
              color: ${primaryColor};
              text-transform: uppercase;
              letter-spacing: 2px;
              margin: 0 0 20px 0;
            }
            
            .quote-meta {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 40px;
              margin: 30px 0;
            }
            
            .quote-number {
              font-size: 20px;
              font-weight: 700;
              color: ${primaryColor};
            }
            
            .quote-date {
              font-size: 16px;
              color: ${textColor};
              font-weight: 600;
            }
            
            .customer-project-section {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 50px;
              margin: 40px 0;
            }
            
            .info-block {
              background: #ffffff;
              padding: 25px;
              border-radius: 8px;
              border-left: 4px solid ${accentColor};
              box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
            }
            
            .info-block h3 {
              font-size: 18px;
              font-weight: 700;
              color: ${primaryColor};
              margin: 0 0 15px 0;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            
            .info-block p {
              margin: 8px 0;
              font-size: 14px;
              line-height: 1.6;
            }
            
            .info-block strong {
              color: ${textColor};
              font-weight: 600;
            }
            
            .separator-line {
              width: 100%;
              height: 2px;
              background: linear-gradient(90deg, ${primaryColor} 0%, ${accentColor} 50%, ${primaryColor} 100%);
              margin: 30px 0;
              border: none;
            }
            
            .footer-branding {
              text-align: center;
              padding: 30px 0;
              border-top: 2px solid ${accentColor};
              margin-top: auto;
            }
            
            .footer-text {
              font-size: 14px;
              color: ${textColor};
              font-style: italic;
            }
            
            .footer-accent {
              color: ${primaryColor};
              font-weight: 600;
            }
            
            /* Existing content styles */
            .header { border-bottom: 2px solid ${primaryColor}; padding-bottom: 20px; margin-bottom: 20px; }
            .section { margin: 20px 0; page-break-inside: avoid; }
            .section-title { font-size: 18px; font-weight: bold; margin-bottom: 10px; border-bottom: 1px solid #ddd; padding-bottom: 5px; color: ${primaryColor}; }
            table { width: 100%; border-collapse: collapse; margin: 10px 0; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; color: ${primaryColor}; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
            .image-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
            .image-item { text-align: center; }
            .image-item img { max-width: 100%; height: auto; max-height: 300px; border-radius: 8px; }
            
            @media print { 
              @page { 
                margin: 15mm;
                size: letter;
              }
              .page-break { page-break-before: always; }
              .cover-page { height: 100vh; }
              body { -webkit-print-color-adjust: exact; color-adjust: exact; }
            }
          </style>
        `;

        // Professional Branded Cover Page
        if (options.brandedCover) {
          htmlContent += `
            <div class="cover-page">
              <!-- Company Header Section -->
              <div class="cover-header">
                <div class="logo-section">
                  ${settings.logo ? `<img src="${escapeHtml(settings.logo)}" alt="${escapeHtml(settings.companyName)} Logo" class="company-logo" />` : ''}
                  <h1 class="company-name">${escapeHtml(settings.companyName)}</h1>
                </div>
                <div class="contact-info">
                  ${settings.address ? `<div><strong>Address:</strong><br>${escapeHtml(settings.address).replace(/\n/g, '<br>')}</div>` : ''}
                  <div style="margin-top: 10px;">
                    ${settings.phone ? `<strong>Phone:</strong> ${escapeHtml(settings.phone)}<br>` : ''}
                    ${settings.email ? `<strong>Email:</strong> ${escapeHtml(settings.email)}<br>` : ''}
                    ${settings.website ? `<strong>Website:</strong> ${escapeHtml(settings.website)}` : ''}
                  </div>
                </div>
              </div>
              
              <hr class="separator-line" />
              
              <!-- Quote Header Section -->
              <div class="quote-header">
                <h2 class="construction-quote-title">Construction Quote</h2>
                <div class="quote-meta">
                  <div class="quote-number">Quote #: ${escapeHtml(quote.quoteNumber)}</div>
                  <div class="quote-date">Date: ${format(new Date(), 'MMMM do, yyyy')}</div>
                </div>
              </div>
              
              <!-- Customer and Project Information -->
              <div class="customer-project-section">
                <div class="info-block">
                  <h3>Prepared for:</h3>
                  <p><strong>Name:</strong> ${escapeHtml(quote.customer?.name || 'Customer Name Not Provided')}</p>
                  ${quote.customer?.company ? `<p><strong>Company:</strong> ${escapeHtml(quote.customer.company)}</p>` : ''}
                  ${quote.customer?.email ? `<p><strong>Email:</strong> ${escapeHtml(quote.customer.email)}</p>` : ''}
                  ${quote.customer?.phone ? `<p><strong>Phone:</strong> ${escapeHtml(quote.customer.phone)}</p>` : ''}
                </div>
                
                <div class="info-block">
                  <h3>Project:</h3>
                  ${quote.projectName ? `<p><strong>Project Name:</strong> ${escapeHtml(quote.projectName)}</p>` : `<p><strong>Project Name:</strong> Quote ${escapeHtml(quote.quoteNumber)}</p>`}
                  ${quote.projectAddress ? `<p><strong>Project Address:</strong><br>${escapeHtml(quote.projectAddress).replace(/\n/g, '<br>')}</p>` : ''}
                  ${quote.jobsiteAddress && quote.jobsiteAddress !== quote.projectAddress ? `<p><strong>Jobsite Address:</strong><br>${escapeHtml(quote.jobsiteAddress).replace(/\n/g, '<br>')}</p>` : ''}
                  ${quote.estimatedStartDate ? `<p><strong>Estimated Start:</strong> ${escapeHtml(quote.estimatedStartDate)}</p>` : ''}
                </div>
              </div>
              
              <hr class="separator-line" />
              
              <!-- Footer Branding -->
              <div class="footer-branding">
                <p class="footer-text">
                  Professional construction services by <span class="footer-accent">${escapeHtml(settings.companyName)}</span>
                </p>
                ${settings.website ? `<p class="footer-text" style="margin-top: 10px;">Learn more at <span class="footer-accent">${escapeHtml(settings.website)}</span></p>` : ''}
              </div>
            </div>
          `;
        }

        // Quote Details Section - CSS page-break-after on .cover-page handles page break automatically
        htmlContent += `
          <div class="section">
            <h2 class="section-title">Quote Details</h2>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
              <div>
                <h3>Customer Information</h3>
                <p><strong>Name:</strong> ${escapeHtml(quote.customer?.name) || 'N/A'}</p>
                ${quote.customer?.company ? `<p><strong>Company:</strong> ${escapeHtml(quote.customer.company)}</p>` : ''}
                <p><strong>Email:</strong> ${escapeHtml(quote.customer?.email) || 'N/A'}</p>
                <p><strong>Phone:</strong> ${escapeHtml(quote.customer?.phone) || 'N/A'}</p>
              </div>
              <div>
                <h3>Project Information</h3>
                <p><strong>Quote Number:</strong> ${escapeHtml(quote.quoteNumber)}</p>
                ${quote.projectName ? `<p><strong>Project:</strong> ${escapeHtml(quote.projectName)}</p>` : ''}
                ${quote.projectAddress ? `<p><strong>Address:</strong> ${escapeHtml(quote.projectAddress)}</p>` : ''}
                <p><strong>Date:</strong> ${quote.createdAt ? format(new Date(quote.createdAt), 'PPP') : 'N/A'}</p>
              </div>
            </div>
          </div>
        `;

        // Line Items Section
        if (quote.lineItems && quote.lineItems.length > 0) {
          htmlContent += `
            <div class="section">
              <h2 class="section-title">Line Items</h2>
              <table>
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style="text-align: right;">Manufacturer</th>
                    <th style="text-align: right;">Qty</th>
                    <th style="text-align: right;">Unit</th>
                    ${options.showPricing ? '<th style="text-align: right;">Unit Price</th>' : ''}
                    ${options.showPricing ? '<th style="text-align: right;">Markup</th>' : ''}
                    ${options.showPricing ? '<th style="text-align: right;">Discount</th>' : ''}
                    ${options.showPricing ? '<th style="text-align: right;">Amount</th>' : ''}
                  </tr>
                </thead>
                <tbody>
          `;

          quote.lineItems.forEach((item) => {
            const quantity = parseFloat(item.quantity);
            const unitPrice = parseFloat(item.unitPrice);
            const markupValue = parseFloat(item.markupValue);
            const discountValue = parseFloat(item.discountValue);

            let itemTotal = quantity * unitPrice;
            if (item.markupType === 'percentage') {
              itemTotal = itemTotal * (1 + markupValue / 100);
            } else {
              itemTotal = itemTotal + markupValue;
            }
            if (item.discountType === 'percentage') {
              itemTotal = itemTotal * (1 - discountValue / 100);
            } else {
              itemTotal = itemTotal - discountValue;
            }

            htmlContent += `
              <tr>
                <td>${escapeHtml(item.description)}</td>
                <td style="text-align: right;">${escapeHtml(item.manufacturer || 'N/A')}</td>
                <td style="text-align: right;">${quantity}</td>
                <td style="text-align: right;">each</td>
                ${options.showPricing ? `<td style="text-align: right;">${formatCurrency(unitPrice)}</td>` : ''}
                ${options.showPricing ? `<td style="text-align: right;">
                  ${item.markupType === 'percentage' ? `${markupValue}%` : formatCurrency(markupValue)}
                </td>` : ''}
                ${options.showPricing ? `<td style="text-align: right;">
                  ${discountValue > 0 ? (item.discountType === 'percentage' ? `-${discountValue}%` : `-${formatCurrency(discountValue)}`) : '-'}
                </td>` : ''}
                ${options.showPricing ? `<td style="text-align: right;">${formatCurrency(itemTotal)}</td>` : ''}
              </tr>
            `;
          });

          htmlContent += '</tbody>';

          // Totals section - only show if pricing is enabled
          if (options.showPricing) {
            const subtotal = calculateSubtotal();
            const discount = parseFloat(quote?.discount || '0');
            const taxRate = parseFloat(quote?.taxRate || '0');
            const shipping = parseFloat(quote?.shipping || '0');
            const taxAmount = (subtotal - discount) * (taxRate / 100);
            const total = subtotal - discount + taxAmount + shipping;

            // Calculate correct colspan - 4 base columns + 4 pricing columns when pricing is shown
            const colspanCount = 7; // Description, Manufacturer, Qty, Unit, Unit Price, Markup, Discount (total: 7)

            htmlContent += `
              <tfoot>
                <tr class="total-row">
                  <td colspan="${colspanCount}" style="text-align: right;"><strong>Subtotal:</strong></td>
                  <td style="text-align: right;"><strong>${formatCurrency(subtotal)}</strong></td>
                </tr>
            `;

            if (discount > 0) {
              htmlContent += `
                <tr>
                  <td colspan="${colspanCount}" style="text-align: right;">Discount:</td>
                  <td style="text-align: right;">-${formatCurrency(discount)}</td>
                </tr>
              `;
            }

            if (taxAmount > 0) {
              htmlContent += `
                <tr>
                  <td colspan="${colspanCount}" style="text-align: right;">Tax (${taxRate}%):</td>
                  <td style="text-align: right;">${formatCurrency(taxAmount)}</td>
                </tr>
              `;
            }

            if (shipping > 0) {
              htmlContent += `
                <tr>
                  <td colspan="${colspanCount}" style="text-align: right;">Shipping:</td>
                  <td style="text-align: right;">${formatCurrency(shipping)}</td>
                </tr>
              `;
            }

            htmlContent += `
                <tr class="total-row" style="font-size: 18px;">
                  <td colspan="${colspanCount}" style="text-align: right;"><strong>Total:</strong></td>
                  <td style="text-align: right;"><strong>${formatCurrency(total)}</strong></td>
                </tr>
              </tfoot>
            `;
          }

          htmlContent += '</table></div>';
        }

        // Product Renderings Section
        if (options.productRenderings && quote.images && quote.images.length > 0) {
          htmlContent += '<div class="page-break"></div>';
          htmlContent += `
            <div class="section">
              <h2 class="section-title">Product Renderings</h2>
              <div class="image-grid">
          `;

          quote.images.forEach((image, index) => {
            htmlContent += `
              <div class="image-item">
                <img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.altText || `Image ${index + 1}`)}" />
                ${image.caption ? `<p style="font-size: 12px; color: #666; margin-top: 5px;">${escapeHtml(image.caption)}</p>` : ''}
              </div>
            `;
          });

          htmlContent += '</div></div>';
        }

        // Notes Section
        if (quote.notes) {
          htmlContent += `
            <div class="section">
              <h2 class="section-title">Additional Notes</h2>
              <p style="white-space: pre-wrap;">${escapeHtml(quote.notes)}</p>
            </div>
          `;
        }

        return htmlContent;
      };

      // Create and open print window
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error('Popup blocked. Please allow popups and try again.');
      }

      const htmlContent = generatePDFContent();
      const filename = `${escapeHtml(quote.projectName || 'Quote')}-${escapeHtml(quote.quoteNumber)}`;

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${filename}</title>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
        </head>
        <body>
          ${htmlContent}
          <script>
            window.onload = function() {
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
        description: error instanceof Error ? error.message : "Failed to generate PDF. Please try again.", 
        variant: "destructive" 
      });
    },
  });

  const handleGeneratePDF = () => {
    generatePDFMutation.mutate(pdfOptions);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner text="Loading quote details..." />
        </div>
      </div>
    );
  }

  if (error || !quote) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">Quote not found</h2>
            <p className="mt-2 text-gray-600">The quote you're looking for doesn't exist.</p>
            <Button 
              onClick={() => setLocation("/quotes")}
              className="mt-4"
              data-testid="button-back-quotes"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Quotes
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const getDealStageLabel = (stage: string) => {
    const stages: Record<string, string> = {
      new_lead: "New Lead",
      qualified: "Qualified",
      proposal_sent: "Proposal Sent",
      negotiation: "Negotiation",
      closed_won: "Closed Won",
      closed_lost: "Closed Lost",
    };
    return stages[stage] || stage;
  };

  const getDealStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      new_lead: "bg-gray-100 text-gray-800",
      qualified: "bg-blue-100 text-blue-800",
      proposal_sent: "bg-purple-100 text-purple-800",
      negotiation: "bg-yellow-100 text-yellow-800",
      closed_won: "bg-green-100 text-green-800",
      closed_lost: "bg-red-100 text-red-800",
    };
    return colors[stage] || "bg-gray-100 text-gray-800";
  };

  const formatCurrency = (amount: number | string) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(numAmount || 0);
  };

  // Calculate totals from line items
  const calculateSubtotal = () => {
    if (!quote?.lineItems) return 0;
    return quote.lineItems.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity);
      const unitPrice = parseFloat(item.unitPrice);
      const markupValue = parseFloat(item.markupValue);
      const discountValue = parseFloat(item.discountValue);
      
      let itemTotal = quantity * unitPrice;
      
      // Apply markup
      if (item.markupType === 'percentage') {
        itemTotal = itemTotal * (1 + markupValue / 100);
      } else {
        itemTotal = itemTotal + markupValue;
      }
      
      // Apply discount
      if (item.discountType === 'percentage') {
        itemTotal = itemTotal * (1 - discountValue / 100);
      } else {
        itemTotal = itemTotal - discountValue;
      }
      
      return sum + itemTotal;
    }, 0);
  };

  const subtotal = calculateSubtotal();
  const discount = parseFloat(quote?.discount || '0');
  const taxRate = parseFloat(quote?.taxRate || '0');
  const shipping = parseFloat(quote?.shipping || '0');
  const taxAmount = (subtotal - discount) * (taxRate / 100);
  const total = subtotal - discount + taxAmount + shipping;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              onClick={() => setLocation("/quotes")}
              data-testid="button-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid={`text-quote-${quote.id}`}>
                {quote.projectName || `Quote ${quote.quoteNumber}`}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Quote #{quote.quoteNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge 
              className={getDealStageColor(quote.dealStage || 'new_lead')}
              data-testid={`badge-stage-${quote.id}`}
            >
              {getDealStageLabel(quote.dealStage || 'new_lead')}
            </Badge>
            <Button 
              onClick={() => setLocation(`/quotes/${quote.id}/edit`)}
              data-testid="button-edit-quote"
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit Quote
            </Button>
            <Button 
              variant="outline" 
              onClick={handleGeneratePDF}
              disabled={generatePDFMutation.isPending}
              data-testid="button-download-pdf"
            >
              {generatePDFMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {generatePDFMutation.isPending ? "Generating..." : "Download PDF"}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Customer Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="font-medium" data-testid={`text-customer-name-${quote.id}`}>
                      {quote.customer?.name || 'N/A'}
                    </p>
                  </div>
                  {quote.customer?.company && (
                    <div>
                      <p className="text-sm text-gray-600">Company</p>
                      <p className="font-medium flex items-center gap-1" data-testid={`text-company-${quote.id}`}>
                        <Building2 className="h-4 w-4" />
                        {quote.customer.company}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-sm text-gray-600">Email</p>
                    <p className="font-medium flex items-center gap-1" data-testid={`text-email-${quote.id}`}>
                      <Mail className="h-4 w-4" />
                      {quote.customer?.email || 'N/A'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium flex items-center gap-1" data-testid={`text-phone-${quote.id}`}>
                      <Phone className="h-4 w-4" />
                      {quote.customer?.phone || 'N/A'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Line Items */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Line Items
                </CardTitle>
              </CardHeader>
              <CardContent>
                {quote.lineItems && quote.lineItems.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 px-4">Description</th>
                          <th className="text-right py-2 px-4">Qty</th>
                          <th className="text-right py-2 px-4">Unit Price</th>
                          <th className="text-right py-2 px-4">Markup</th>
                          <th className="text-right py-2 px-4">Discount</th>
                          <th className="text-right py-2 px-4">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {quote.lineItems.map((item, index) => {
                          const quantity = parseFloat(item.quantity);
                          const unitPrice = parseFloat(item.unitPrice);
                          const markupValue = parseFloat(item.markupValue);
                          const discountValue = parseFloat(item.discountValue);
                          
                          let itemTotal = quantity * unitPrice;
                          
                          // Apply markup
                          if (item.markupType === 'percentage') {
                            itemTotal = itemTotal * (1 + markupValue / 100);
                          } else {
                            itemTotal = itemTotal + markupValue;
                          }
                          
                          // Apply discount
                          if (item.discountType === 'percentage') {
                            itemTotal = itemTotal * (1 - discountValue / 100);
                          } else {
                            itemTotal = itemTotal - discountValue;
                          }
                          
                          return (
                            <tr key={item.id || index} className="border-b" data-testid={`row-item-${item.id || index}`}>
                              <td className="py-2 px-4">{item.description}</td>
                              <td className="text-right py-2 px-4">{quantity}</td>
                              <td className="text-right py-2 px-4">{formatCurrency(unitPrice)}</td>
                              <td className="text-right py-2 px-4">
                                {item.markupType === 'percentage' ? `${markupValue}%` : formatCurrency(markupValue)}
                              </td>
                              <td className="text-right py-2 px-4">
                                {discountValue > 0 ? (
                                  item.discountType === 'percentage' ? `-${discountValue}%` : `-${formatCurrency(discountValue)}`
                                ) : '-'}
                              </td>
                              <td className="text-right py-2 px-4 font-medium">
                                {formatCurrency(itemTotal)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-gray-500">No line items added</p>
                )}
              </CardContent>
            </Card>

            {/* Notes */}
            {quote.notes && (
              <Card>
                <CardHeader>
                  <CardTitle>Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-wrap text-sm" data-testid={`text-notes-${quote.id}`}>
                    {quote.notes}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quote Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <DollarSign className="h-5 w-5" />
                  Quote Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Subtotal</p>
                  <p className="text-xl font-bold" data-testid={`text-subtotal-${quote.id}`}>
                    {formatCurrency(subtotal)}
                  </p>
                </div>
                {discount > 0 && (
                  <div>
                    <p className="text-sm text-gray-600">Discount</p>
                    <p className="text-lg font-medium text-red-600">
                      -{formatCurrency(discount)}
                    </p>
                  </div>
                )}
                {taxAmount > 0 && (
                  <div>
                    <p className="text-sm text-gray-600">Tax ({taxRate}%)</p>
                    <p className="text-lg font-medium">
                      {formatCurrency(taxAmount)}
                    </p>
                  </div>
                )}
                {shipping > 0 && (
                  <div>
                    <p className="text-sm text-gray-600">Shipping</p>
                    <p className="text-lg font-medium">
                      {formatCurrency(shipping)}
                    </p>
                  </div>
                )}
                <div className="border-t pt-3">
                  <p className="text-sm text-gray-600">Total</p>
                  <p className="text-2xl font-bold text-green-600" data-testid={`text-total-${quote.id}`}>
                    {formatCurrency(total)}
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* PDF Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  PDF Options
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Branded Cover Page Toggle */}
                <div className="flex items-start justify-between" data-testid="pdf-option-branded-cover">
                  <div className="flex-1">
                    <Label htmlFor="branded-cover" className="text-sm font-medium cursor-pointer">
                      Branded Cover Page
                    </Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Include professional cover page with company branding and project details
                    </p>
                  </div>
                  <Switch
                    id="branded-cover"
                    checked={pdfOptions.brandedCover}
                    onCheckedChange={(checked) => 
                      setPdfOptions(prev => ({ ...prev, brandedCover: checked }))
                    }
                    data-testid="switch-branded-cover"
                  />
                </div>

                <Separator />

                {/* Product Renderings Toggle */}
                <div className="flex items-start justify-between" data-testid="pdf-option-product-renderings">
                  <div className="flex-1">
                    <Label htmlFor="product-renderings" className="text-sm font-medium cursor-pointer">
                      <div className="flex items-center gap-1">
                        Product Renderings
                        <ImageIcon className="h-3 w-3" />
                      </div>
                    </Label>
                    <p className="text-xs text-gray-600 mt-1">
                      Include uploaded product images and renderings
                      {quote?.images && quote.images.length > 0 && (
                        <span className="text-green-600 ml-1">
                          ({quote.images.length} image{quote.images.length !== 1 ? 's' : ''} available)
                        </span>
                      )}
                    </p>
                  </div>
                  <Switch
                    id="product-renderings"
                    checked={pdfOptions.productRenderings}
                    onCheckedChange={(checked) => 
                      setPdfOptions(prev => ({ ...prev, productRenderings: checked }))
                    }
                    disabled={!quote?.images || quote.images.length === 0}
                    data-testid="switch-product-renderings"
                  />
                </div>

                <Separator />

                {/* Show Pricing Toggle */}
                <div className="flex items-start justify-between" data-testid="pdf-option-show-pricing">
                  <div className="flex-1">
                    <Label htmlFor="show-pricing" className="text-sm font-medium cursor-pointer">
                      <div className="flex items-center gap-1">
                        Show Pricing
                        {pdfOptions.showPricing ? (
                          <Eye className="h-3 w-3 text-green-600" />
                        ) : (
                          <EyeOff className="h-3 w-3 text-gray-400" />
                        )}
                      </div>
                    </Label>
                    <p className="text-xs text-gray-600 mt-1">
                      {pdfOptions.showPricing 
                        ? "All pricing information will be visible" 
                        : "Pricing information will be hidden"
                      }
                    </p>
                  </div>
                  <Switch
                    id="show-pricing"
                    checked={pdfOptions.showPricing}
                    onCheckedChange={(checked) => 
                      setPdfOptions(prev => ({ ...prev, showPricing: checked }))
                    }
                    data-testid="switch-show-pricing"
                  />
                </div>

                <Separator />

                {/* PDF Preview Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-blue-800">
                      <p className="font-medium mb-1">PDF Preview:</p>
                      <ul className="space-y-1 list-disc list-inside">
                        {pdfOptions.brandedCover && (
                          <li>Page 1: Professional cover page with company branding</li>
                        )}
                        <li>Quote details with customer information</li>
                        <li>
                          Line items table 
                          {pdfOptions.showPricing ? " with pricing" : " without pricing"}
                        </li>
                        {pdfOptions.productRenderings && quote?.images && quote.images.length > 0 && (
                          <li>Product renderings section ({quote.images.length} images)</li>
                        )}
                        {quote.notes && <li>Additional notes</li>}
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quote Details */}
            <Card>
              <CardHeader>
                <CardTitle>Quote Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-sm text-gray-600">Created</p>
                  <p className="font-medium">
                    {quote.createdAt ? format(new Date(quote.createdAt), 'PPP') : 'N/A'}
                  </p>
                </div>
                {quote.updatedAt && (
                  <div>
                    <p className="text-sm text-gray-600">Last Updated</p>
                    <p className="font-medium">
                      {format(new Date(quote.updatedAt), 'PPP')}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Product Renderings Section */}
        <div className="mt-8">
          <ImageUpload 
            quoteId={quoteId} 
            className="w-full"
            data-testid="quote-image-upload" 
          />
        </div>
      </div>
    </div>
  );
}