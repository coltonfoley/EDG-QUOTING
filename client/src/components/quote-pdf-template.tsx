import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Download, Edit3, Save } from "lucide-react";
import { formatCurrency, calculateQuoteTotals } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { QuoteWithDetails } from "@shared/schema";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

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
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo>({
    name: "EDG Patio & Shade",
    address: "123 Patio Drive, Shade City, SC 12345",
    phone: "(555) 123-4567",
    email: "info@edgpatioandshade.com",
    license: "License #SC-12345",
    customerName: quote.customer.name,
    customerCompany: quote.customer.company || "",
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
    quote.taxRate,
    quote.discount
  );

  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      const element = document.getElementById('quote-pdf-content');
      if (!element) throw new Error('PDF content not found');

      const canvas = await html2canvas(element, {
        scale: 1, // Reduced from 2 to 1 for smaller file size
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        windowWidth: 1200, // Fixed width for consistency
        windowHeight: element.scrollHeight,
      });

      // Convert to JPEG with compression for smaller file size
      const imgData = canvas.toDataURL('image/jpeg', 0.85); // 85% quality
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgWidth = 210;
      const pageHeight = 295;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      let heightLeft = imgHeight;

      let position = 0;

      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      pdf.save(`Quote-${quote.quoteNumber}.pdf`);
    },
    onSuccess: () => {
      toast({ title: "PDF downloaded successfully" });
      onClose();
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
            <DialogTitle>Quote PDF Template</DialogTitle>
            <div className="flex space-x-2">
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
                disabled={generatePDFMutation.isPending}
                className="bg-edg-black hover:bg-edg-grey text-edg-white"
              >
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </Button>
            </div>
          </div>
        </DialogHeader>

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
          <div id="quote-pdf-content" className="bg-white p-8 text-black" style={{ minHeight: '297mm' }}>
            {/* Header */}
            <div className="flex justify-between items-start mb-8 border-b-2 border-edg-teal pb-6">
              <div>
                <h1 className="text-3xl font-bold text-edg-black mb-2">{companyInfo.name}</h1>
                <div className="text-sm text-gray-600 space-y-1">
                  <div>{companyInfo.address}</div>
                  <div>Phone: {companyInfo.phone} | Email: {companyInfo.email}</div>
                  <div>{companyInfo.license}</div>
                </div>
              </div>
              <div className="text-right">
                <h2 className="text-2xl font-bold text-edg-black mb-2">QUOTE</h2>
                <div className="text-sm space-y-1">
                  <div><strong>Quote #:</strong> {quote.quoteNumber}</div>
                  <div><strong>Date:</strong> {new Date(quote.createdAt!).toLocaleDateString()}</div>
                  <div><strong>Valid For:</strong> {quoteTerms.validFor}</div>
                </div>
              </div>
            </div>

            {/* Customer & Project Info */}
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-semibold text-edg-black mb-3">Bill To:</h3>
                <div className="space-y-1">
                  <div className="font-medium">{companyInfo.customerName}</div>
                  {companyInfo.customerCompany && (
                    <div className="font-medium text-edg-grey">{companyInfo.customerCompany}</div>
                  )}
                  <div>{companyInfo.customerEmail}</div>
                  {companyInfo.customerPhone && <div>{companyInfo.customerPhone}</div>}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-edg-black mb-3">Project Details:</h3>
                <div className="space-y-1">
                  <div><strong>Project:</strong> {quote.projectName}</div>
                  <div><strong>Location:</strong> {quote.projectAddress}</div>
                  {quote.estimatedStartDate && (
                    <div><strong>Est. Start:</strong> {new Date(quote.estimatedStartDate).toLocaleDateString()}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="mb-8">
              <table className="w-full border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border border-gray-300 px-4 py-3 text-left">Description</th>
                    <th className="border border-gray-300 px-4 py-3 text-center">Quantity</th>
                    <th className="border border-gray-300 px-4 py-3 text-right">Rate</th>
                    <th className="border border-gray-300 px-4 py-3 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.lineItems.map((item, index) => {
                    const qty = parseFloat(item.quantity.toString());
                    const price = parseFloat(item.unitPrice.toString());
                    const markup = parseFloat(item.markupValue.toString());
                    const baseTotal = qty * price;
                    const total = item.markupType === 'percentage' 
                      ? baseTotal + (baseTotal * (markup / 100))
                      : baseTotal + markup;
                    const rateWithMarkup = total / qty; // Final rate per unit including markup

                    return (
                      <tr key={index} className="border-b">
                        <td className="border border-gray-300 px-4 py-3">{item.description}</td>
                        <td className="border border-gray-300 px-4 py-3 text-center">{item.quantity}</td>
                        <td className="border border-gray-300 px-4 py-3 text-right">{formatCurrency(rateWithMarkup)}</td>
                        <td className="border border-gray-300 px-4 py-3 text-right font-medium">
                          {formatCurrency(total)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="w-80">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>{formatCurrency(totals.subtotal)}</span>
                  </div>
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>Discount ({quote.discount}%):</span>
                      <span>-{formatCurrency(totals.discountAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Tax ({quote.taxRate}%):</span>
                    <span>{formatCurrency(totals.taxAmount)}</span>
                  </div>
                  <div className="border-t border-gray-300 pt-2">
                    <div className="flex justify-between text-lg font-bold text-edg-black">
                      <span>Total:</span>
                      <span>{formatCurrency(totals.total)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Terms and Notes */}
            <div className="space-y-6">
              {quote.notes && (
                <div>
                  <h3 className="text-lg font-semibold text-edg-black mb-3">Project Notes:</h3>
                  <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
                </div>
              )}

              {/* Contract Terms Section */}
              {(quote.contractTemplate || quote.customContractTerms) ? (
                <div className="space-y-4">
                  <h3 className="text-xl font-bold text-edg-black border-b-2 border-edg-teal pb-2">
                    {quote.contractTemplate?.title || 'Contract Terms'}
                  </h3>
                  <div className="text-sm text-gray-800 leading-relaxed whitespace-pre-line">
                    {quote.customContractTerms || quote.contractTemplate?.terms}
                  </div>
                  
                  {/* Signature Section */}
                  <div className="mt-8 space-y-6 border-t border-gray-300 pt-6">
                    <h4 className="text-lg font-semibold text-edg-black">Agreement Signatures</h4>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* Issuer Signature */}
                      <div className="space-y-3">
                        <h5 className="font-semibold text-edg-black">EDG Patio & Shade (Issuer)</h5>
                        <div className="border-b-2 border-gray-400 pb-2 min-h-[40px] flex items-end">
                          {quote.issuerSignature && (
                            <span className="italic text-gray-700 text-lg">{quote.issuerSignature}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          <div>Authorized Signature</div>
                          {quote.issuerSignatureDate && (
                            <div>Date: {new Date(quote.issuerSignatureDate).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>
                      
                      {/* Customer Signature */}
                      <div className="space-y-3">
                        <h5 className="font-semibold text-edg-black">Customer Acceptance</h5>
                        <div className="border-b-2 border-gray-400 pb-2 min-h-[40px] flex items-end">
                          {quote.customerSignature && (
                            <span className="italic text-gray-700 text-lg">{quote.customerSignature}</span>
                          )}
                        </div>
                        <div className="text-xs text-gray-600">
                          <div>Customer Signature</div>
                          {quote.customerSignatureDate && (
                            <div>Date: {new Date(quote.customerSignatureDate).toLocaleDateString()}</div>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    {/* Signature Status */}
                    <div className="text-center p-3 bg-gray-50 rounded">
                      <div className="text-sm">
                        <span className="font-medium">Document Status: </span>
                        <span className={`capitalize font-semibold ${
                          quote.signatureStatus === 'fully_signed' ? 'text-green-600' :
                          quote.signatureStatus === 'pending' ? 'text-yellow-600' :
                          'text-blue-600'
                        }`}>
                          {quote.signatureStatus?.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                // Legacy Terms & Conditions for quotes without contracts
                <div>
                  <h3 className="text-lg font-semibold text-edg-black mb-3">Terms & Conditions:</h3>
                  <div className="text-sm space-y-2">
                    <div><strong>Payment Terms:</strong> {quoteTerms.paymentTerms}</div>
                    <div><strong>Warranty:</strong> {quoteTerms.warranty}</div>
                    <div><strong>Additional Notes:</strong> {quoteTerms.additionalNotes}</div>
                  </div>
                </div>
              )}

              <div className="border-t border-gray-300 pt-6 text-center text-sm text-gray-600">
                <p>Thank you for considering {companyInfo.name} for your construction project.</p>
                <p>This quote is valid for {quoteTerms.validFor} from the date above.</p>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}