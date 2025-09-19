import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { LoadingSpinner } from "@/components/loading-spinner";
import { 
  ArrowLeft, 
  Save, 
  Eye,
  Building2,
  FileText,
  ClipboardList,
  Loader2,
  Download
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import { BasicQuoteTemplate } from "@/components/template-renderers/basic-quote-template";
import type { QuoteWithDetails, ProposalTemplate, BrandingSettings, DefaultContent } from "@shared/schema";
import { COMPANY_INFO, QUOTE_TERMS } from "@shared/companyConfig";

// Form validation schema
const proposalFormSchema = z.object({
  companyName: z.string().min(1, "Company name is required"),
  companyAddress: z.string().min(1, "Company address is required"),
  companyPhone: z.string().min(1, "Company phone is required"),
  companyEmail: z.string().email("Valid email is required"),
  projectDescription: z.string().optional(),
  specialNotes: z.string().optional(),
  paymentTerms: z.string().min(1, "Payment terms are required"),
  warranty: z.string().min(1, "Warranty information is required"),
  additionalNotes: z.string().optional(),
});

type ProposalFormData = z.infer<typeof proposalFormSchema>;

// Create a default template for preview
const createDefaultTemplate = (): ProposalTemplate => ({
  id: 0,
  name: "Default Basic Quote",
  description: "Basic quote template",
  category: "basic_quote",
  templateType: "pdf",
  sections: [],
  layoutSettings: {
    pageSize: "letter" as const,
    margins: { top: 20, bottom: 20, left: 20, right: 20 },
    spacing: { sectionGap: 16, paragraphGap: 8 },
    pageBreaks: { beforeSections: [], avoidBreakInSections: [] }
  },
  brandingSettings: {
    primaryColor: "#1e40af",
    accentColor: "#3b82f6",
    textColor: "#1f2937",
    backgroundColor: "#ffffff",
    logoSize: "medium" as const,
    headerStyle: "standard" as const,
    footerStyle: "minimal" as const
  } as BrandingSettings,
  defaultContent: {
    companyDescription: "Professional outdoor living solutions",
    projectScope: "Custom pergola installation",
    timeline: "2-3 weeks from approval",
    credentials: "Licensed and insured contractor",
    warranty: "1 year limited warranty",
    paymentTerms: "50% deposit, 50% on completion",
    additionalTerms: "Materials subject to availability"
  } as DefaultContent,
  isActive: true,
  isDefault: true,
  createdAt: new Date(),
  updatedAt: new Date()
});

export default function ProposalEditor() {
  const { id } = useParams();
  const [, setLocation] = useLocation();
  const quoteId = id ? parseInt(id) : undefined;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // PDF generation state
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const { data: quote, isLoading, error } = useQuery<QuoteWithDetails>({
    queryKey: [`/api/quotes/${quoteId}`],
    enabled: !!quoteId,
  });

  // Initialize form with company defaults
  const form = useForm<ProposalFormData>({
    resolver: zodResolver(proposalFormSchema),
    defaultValues: {
      companyName: COMPANY_INFO.name,
      companyAddress: COMPANY_INFO.address,
      companyPhone: COMPANY_INFO.phone,
      companyEmail: COMPANY_INFO.email,
      projectDescription: "",
      specialNotes: "",
      paymentTerms: QUOTE_TERMS.paymentTerms,
      warranty: QUOTE_TERMS.warranty,
      additionalNotes: QUOTE_TERMS.additionalNotes,
    },
  });

  // Load saved proposal data when quote loads
  useEffect(() => {
    if (quote?.customContractTerms) {
      try {
        const savedProposalData = JSON.parse(quote.customContractTerms) as ProposalFormData;
        
        // Validate that the parsed data has the expected structure
        if (savedProposalData && typeof savedProposalData === 'object') {
          // Reset form with saved data, falling back to defaults for any missing fields
          form.reset({
            companyName: savedProposalData.companyName || COMPANY_INFO.name,
            companyAddress: savedProposalData.companyAddress || COMPANY_INFO.address,
            companyPhone: savedProposalData.companyPhone || COMPANY_INFO.phone,
            companyEmail: savedProposalData.companyEmail || COMPANY_INFO.email,
            projectDescription: savedProposalData.projectDescription || "",
            specialNotes: savedProposalData.specialNotes || "",
            paymentTerms: savedProposalData.paymentTerms || QUOTE_TERMS.paymentTerms,
            warranty: savedProposalData.warranty || QUOTE_TERMS.warranty,
            additionalNotes: savedProposalData.additionalNotes || QUOTE_TERMS.additionalNotes,
          });
        }
      } catch (error) {
        console.warn('Failed to parse saved proposal data, using defaults:', error);
        // Form will continue to use the default values already set
      }
    }
  }, [quote, form]);

  const saveProposalMutation = useMutation({
    mutationFn: async (data: ProposalFormData) => {
      if (!quoteId) throw new Error("No quote ID");
      // For now, we'll save this as quote notes or custom fields
      // This can be extended later with a proper proposal table
      const response = await apiRequest("PUT", `/api/quotes/${quoteId}`, {
        customContractTerms: JSON.stringify(data),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/quotes/${quoteId}`] });
      toast({ title: "Proposal saved successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save proposal", variant: "destructive" });
    },
  });

  const onSubmit = (data: ProposalFormData) => {
    saveProposalMutation.mutate(data);
  };

  // Secure PDF generation function - targets live preview DOM directly
  const generatePDF = async () => {
    if (!quoteId) {
      toast({ title: "Error", description: "No quote ID available", variant: "destructive" });
      return;
    }

    setIsGeneratingPDF(true);
    try {
      // Step 1: Save current form data first
      const formData = form.getValues();
      console.log("🔧 Saving proposal data before PDF generation...");
      
      await apiRequest("PUT", `/api/quotes/${quoteId}`, {
        customContractTerms: JSON.stringify(formData),
      });

      // Step 2: Target the live preview DOM directly for exact parity
      console.log("🔧 Targeting live preview DOM for PDF generation...");
      
      // Find the BasicQuoteTemplate container in the preview panel
      const previewContainer = document.querySelector('[data-testid="proposal-preview-container"]') as HTMLElement;
      
      if (!previewContainer) {
        throw new Error('Preview container not found. Please ensure the preview is visible.');
      }

      // Get the actual dimensions of the content
      const contentWidth = previewContainer.scrollWidth;
      const contentHeight = previewContainer.scrollHeight;
      
      console.log(`🔧 Content dimensions: ${contentWidth}x${contentHeight}px`);

      // Convert to canvas with proper dimensions (no fixed sizes!)
      const canvas = await html2canvas(previewContainer, {
        scale: 2, // High resolution
        useCORS: true,
        backgroundColor: '#ffffff',
        width: contentWidth,
        height: contentHeight,
        scrollX: 0,
        scrollY: 0,
        allowTaint: false,
        foreignObjectRendering: true,
      });

      // Create PDF with proper multi-page handling
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgData = canvas.toDataURL('image/png', 1.0);
      
      // A4 dimensions in mm
      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10; // 10mm margins
      const printableWidth = pageWidth - (margin * 2);
      const printableHeight = pageHeight - (margin * 2);
      
      // Calculate scaling to fit width
      const scale = printableWidth / (contentWidth * 0.264583); // Convert px to mm (96 DPI)
      const scaledHeight = (contentHeight * 0.264583) * scale;
      
      console.log(`🔧 Scaled content height: ${scaledHeight}mm, Page height: ${printableHeight}mm`);
      
      // Check if content fits on single page
      if (scaledHeight <= printableHeight) {
        // Single page - simple case
        pdf.addImage(imgData, 'PNG', margin, margin, printableWidth, scaledHeight);
        console.log("🔧 Content fits on single page");
      } else {
        // Multi-page rendering - split content properly
        console.log("🔧 Content requires multiple pages");
        
        const pagesNeeded = Math.ceil(scaledHeight / printableHeight);
        console.log(`🔧 Pages needed: ${pagesNeeded}`);
        
        for (let pageIndex = 0; pageIndex < pagesNeeded; pageIndex++) {
          if (pageIndex > 0) {
            pdf.addPage();
          }
          
          // Calculate the portion of the image for this page
          const sourceY = (pageIndex * printableHeight) / scale / 0.264583; // Convert back to pixels
          const sourceHeight = Math.min(
            printableHeight / scale / 0.264583, 
            contentHeight - sourceY
          );
          
          // Create a temporary canvas for this page section
          const pageCanvas = document.createElement('canvas');
          const pageCtx = pageCanvas.getContext('2d')!;
          
          pageCanvas.width = canvas.width;
          pageCanvas.height = sourceHeight * 2; // Account for scale factor
          
          // Draw the section of the original canvas
          pageCtx.drawImage(
            canvas,
            0, sourceY * 2, // Source position (scale factor)
            canvas.width, sourceHeight * 2, // Source dimensions
            0, 0, // Destination position
            canvas.width, sourceHeight * 2 // Destination dimensions
          );
          
          const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
          const pageScaledHeight = sourceHeight * 0.264583 * scale;
          
          pdf.addImage(pageImgData, 'PNG', margin, margin, printableWidth, pageScaledHeight);
          
          console.log(`🔧 Added page ${pageIndex + 1}/${pagesNeeded}`);
        }
      }

      // Download PDF
      const filename = `Proposal-${quote.quoteNumber || 'Quote'}.pdf`;
      pdf.save(filename);

      toast({ 
        title: "Success", 
        description: `PDF generated and downloaded as ${filename}. ${scaledHeight > printableHeight ? `Content split across ${Math.ceil(scaledHeight / printableHeight)} pages.` : 'Single page generated.'}` 
      });

    } catch (error) {
      console.error("❌ Error generating PDF:", error);
      toast({ 
        title: "Error", 
        description: `Failed to generate PDF: ${(error as Error).message}`, 
        variant: "destructive" 
      });
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <LoadingSpinner text="Loading quote data..." />
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
              onClick={() => setLocation(`/quotes/${quote.id}`)}
              data-testid="button-back-quote"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Quote
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900" data-testid={`text-proposal-editor-${quote.id}`}>
                Edit Proposal - {quote.projectName || `Quote ${quote.quoteNumber}`}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
                Quote #{quote.quoteNumber}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              onClick={form.handleSubmit(onSubmit)}
              disabled={saveProposalMutation.isPending}
              data-testid="button-save-proposal"
            >
              {saveProposalMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Proposal
            </Button>
            <Button 
              variant="secondary"
              onClick={generatePDF}
              disabled={saveProposalMutation.isPending || isGeneratingPDF}
              data-testid="button-generate-pdf"
            >
              {isGeneratingPDF ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {isGeneratingPDF ? "Generating PDF..." : "Generate PDF"}
            </Button>
          </div>
        </div>

        {/* Split-view Layout */}
        <div className="h-[calc(100vh-200px)] border rounded-lg overflow-hidden bg-white">
          <ResizablePanelGroup direction="horizontal">
            {/* Left Panel - Editing Form */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full overflow-y-auto p-6">
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                  {/* Company Information Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Company Information</h3>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="companyName">Company Name</Label>
                        <Input
                          id="companyName"
                          {...form.register("companyName")}
                          data-testid="input-company-name"
                        />
                        {form.formState.errors.companyName && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyName.message}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="companyEmail">Email</Label>
                        <Input
                          id="companyEmail"
                          type="email"
                          {...form.register("companyEmail")}
                          data-testid="input-company-email"
                        />
                        {form.formState.errors.companyEmail && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyEmail.message}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="companyPhone">Phone</Label>
                        <Input
                          id="companyPhone"
                          {...form.register("companyPhone")}
                          data-testid="input-company-phone"
                        />
                        {form.formState.errors.companyPhone && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyPhone.message}
                          </p>
                        )}
                      </div>
                      
                      <div>
                        <Label htmlFor="companyAddress">Address</Label>
                        <Input
                          id="companyAddress"
                          {...form.register("companyAddress")}
                          data-testid="input-company-address"
                        />
                        {form.formState.errors.companyAddress && (
                          <p className="text-sm text-red-600 mt-1">
                            {form.formState.errors.companyAddress.message}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Project Details Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <FileText className="h-5 w-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Project Details</h3>
                    </div>
                    
                    <div>
                      <Label htmlFor="projectDescription">Custom Description</Label>
                      <Textarea
                        id="projectDescription"
                        placeholder="Enter a detailed project description for the proposal..."
                        className="min-h-[120px]"
                        {...form.register("projectDescription")}
                        data-testid="textarea-project-description"
                      />
                    </div>
                    
                    <div>
                      <Label htmlFor="specialNotes">Special Notes</Label>
                      <Textarea
                        id="specialNotes"
                        placeholder="Any special notes or requirements..."
                        {...form.register("specialNotes")}
                        data-testid="textarea-special-notes"
                      />
                    </div>
                  </div>

                  <Separator />

                  {/* Terms Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 mb-4">
                      <ClipboardList className="h-5 w-5 text-purple-600" />
                      <h3 className="text-lg font-semibold text-gray-900">Terms & Conditions</h3>
                    </div>
                    
                    <div>
                      <Label htmlFor="paymentTerms">Payment Terms</Label>
                      <Input
                        id="paymentTerms"
                        {...form.register("paymentTerms")}
                        data-testid="input-payment-terms"
                      />
                      {form.formState.errors.paymentTerms && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.paymentTerms.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="warranty">Warranty Information</Label>
                      <Input
                        id="warranty"
                        {...form.register("warranty")}
                        data-testid="input-warranty"
                      />
                      {form.formState.errors.warranty && (
                        <p className="text-sm text-red-600 mt-1">
                          {form.formState.errors.warranty.message}
                        </p>
                      )}
                    </div>
                    
                    <div>
                      <Label htmlFor="additionalNotes">Additional Notes</Label>
                      <Textarea
                        id="additionalNotes"
                        placeholder="Additional terms, conditions, or notes..."
                        {...form.register("additionalNotes")}
                        data-testid="textarea-additional-notes"
                      />
                    </div>
                  </div>
                </form>
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Right Panel - Preview */}
            <ResizablePanel defaultSize={50} minSize={30}>
              <div className="h-full bg-white border-l">
                <div className="p-4 border-b bg-gray-50">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-gray-600" />
                    <span className="font-medium text-gray-700">Proposal Preview</span>
                  </div>
                </div>
                
                <div className="h-full overflow-y-auto bg-gray-100 p-6">
                  {/* Professional styled container for screen display */}
                  <div 
                    className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg border p-8"
                    data-testid="proposal-preview-container"
                  >
                    <BasicQuoteTemplate
                      quote={quote}
                      template={createDefaultTemplate()}
                      companyInfo={{
                        name: form.watch("companyName") || COMPANY_INFO.name,
                        address: form.watch("companyAddress") || COMPANY_INFO.address,
                        phone: form.watch("companyPhone") || COMPANY_INFO.phone,
                        email: form.watch("companyEmail") || COMPANY_INFO.email,
                        license: COMPANY_INFO.license,
                        customerName: quote.customer?.name || quote.account?.name || "",
                        customerCompany: quote.customer?.company || quote.account?.company || "",
                        customerEmail: quote.customer?.email || quote.account?.email || "",
                        customerPhone: quote.customer?.phone || quote.account?.phone || "",
                      }}
                      quoteTerms={{
                        validFor: QUOTE_TERMS.validFor,
                        paymentTerms: form.watch("paymentTerms") || QUOTE_TERMS.paymentTerms,
                        warranty: form.watch("warranty") || QUOTE_TERMS.warranty,
                        additionalNotes: form.watch("additionalNotes") || QUOTE_TERMS.additionalNotes,
                      }}
                    />
                  </div>
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}