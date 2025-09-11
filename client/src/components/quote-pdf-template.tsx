import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Edit3, Loader2, FileText, AlertCircle } from "lucide-react";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";
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

  // Get selected template or default
  const templatesArray = proposalTemplates || [];
  const selectedTemplate = templatesArray.find(
    (t) => t.id.toString() === selectedTemplateId
  ) || templatesArray.find((t) => t.isDefault) || templatesArray[0];
  
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
      // Use browser's native print which respects CSS page breaks
      const printWindow = window.open('', '_blank');
      if (!printWindow) throw new Error('Could not open print window');

      const element = document.getElementById('quote-pdf-content');
      if (!element) throw new Error('PDF content not found');

      // Convert logo to base64 for embedding in PDF
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

      // Create a clone of the element and replace logo src with base64
      const elementClone = element.cloneNode(true) as HTMLElement;
      const logoImgs = elementClone.querySelectorAll('img');
      logoImgs.forEach((logoImg) => {
        if (logoDataUrl && logoImg.src.includes('my-logo')) {
          logoImg.src = logoDataUrl;
        }
      });

      // Copy all stylesheets from current document
      let allStyles = '';
      
      // Get all style and link elements from the current document
      const styleElements = document.querySelectorAll('style, link[rel="stylesheet"]');
      for (const styleEl of styleElements) {
        if (styleEl.tagName === 'STYLE') {
          allStyles += styleEl.outerHTML;
        } else if (styleEl.tagName === 'LINK') {
          // For external stylesheets, we'll try to fetch and inline them
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
            }
            
            /* Ensure consistent font rendering in print */
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #000;
              background: white;
            }
          </style>
        </head>
        <body>
          ${elementClone.outerHTML}
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() {
                window.close();
              }, 1000);
            };
          </script>
        </body>
        </html>
      `);
      
      printWindow.document.close();
    },
    onSuccess: () => {
      toast({ title: "Print dialog opened - save as PDF to download" });
    },
    onError: () => {
      toast({ 
        title: "Error", 
        description: "Failed to generate PDF", 
        variant: "destructive" 
      });
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
              {selectedTemplate?.name || "Quote PDF Template"}
              {selectedTemplate && (
                <span className="text-sm font-normal text-gray-600 ml-2">
                  ({selectedTemplate.description})
                </span>
              )}
            </DialogTitle>
            <div className="flex space-x-4">
              <Select
                value={selectedTemplateId || ""}
                onValueChange={setSelectedTemplateId}
                disabled={templatesLoading}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={templatesLoading ? "Loading..." : "Select Template"}>
                    <div className="flex items-center">
                      <FileText className="mr-2 h-4 w-4" />
                      {selectedTemplate?.name || "Select Template"}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {templatesArray.map((template) => (
                    <SelectItem key={template.id} value={template.id.toString()}>
                      <div className="flex items-center">
                        <FileText className="mr-2 h-4 w-4" />
                        <div>
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-gray-600 capitalize">
                            {template.category.replace('_', ' ')}
                          </div>
                        </div>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={() => setIsEditing(!isEditing)}
                className="border-edg-teal text-edg-teal hover:bg-edg-light-teal hover:bg-opacity-10"
              >
                <Edit3 className="mr-2 h-4 w-4" />
                {isEditing ? "View" : "Edit"} Template
              </Button>
              <Button
                onClick={handleDownload}
                disabled={generatePDFMutation.isPending || !selectedTemplate}
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
              >
                {generatePDFMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Opening Print Dialog...
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

        {isEditing ? (
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