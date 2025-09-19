import type { QuoteWithDetails } from '@shared/schema';
import { COMPANY_INFO, QUOTE_TERMS } from '@shared/companyConfig';

// Remove tight coupling - no longer import from client code
// PDF generation is now handled entirely client-side for security and preview parity

// Proposal form data interface (matching the form schema)
interface ProposalFormData {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  projectDescription?: string;
  specialNotes?: string;
  paymentTerms: string;
  warranty: string;
  additionalNotes?: string;
}

// Parse proposal form data from customContractTerms
function parseProposalData(quote: QuoteWithDetails): ProposalFormData {
  if (quote.customContractTerms) {
    try {
      const parsed = JSON.parse(quote.customContractTerms);
      // Validate that it has the expected structure
      if (parsed && typeof parsed === 'object' && parsed.companyName) {
        return parsed;
      }
    } catch (error) {
      console.warn('Failed to parse proposal data from customContractTerms:', error);
    }
  }
  
  // Return default values if no valid proposal data found
  return {
    companyName: COMPANY_INFO.name,
    companyAddress: COMPANY_INFO.address,
    companyPhone: COMPANY_INFO.phone,
    companyEmail: COMPANY_INFO.email,
    projectDescription: '',
    specialNotes: '',
    paymentTerms: QUOTE_TERMS.paymentTerms,
    warranty: QUOTE_TERMS.warranty,
    additionalNotes: QUOTE_TERMS.additionalNotes
  };
}

// REMOVED: generateQuotePDFContent function with XSS vulnerability
// This function directly interpolated user data into HTML without sanitization,
// creating a serious DOM XSS risk. PDF generation is now handled entirely 
// client-side using the actual React-rendered DOM for security and exact preview parity.

// REMOVED: generateQuotePDF function that relied on unsafe HTML generation
// PDF generation is now handled entirely client-side for security and exact preview parity