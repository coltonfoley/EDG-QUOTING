/**
 * Template Mapper - Connects admin templates to actual EDG business data
 * Maps template configuration fields to real quote/account/contact data
 */

import type { ProposalTemplate, DefaultContent, QuoteWithDetails } from './schema';
import { COMPANY_INFO, QUOTE_TERMS } from './companyConfig';

export interface MappedTemplateData {
  // Company information (always from COMPANY_INFO)
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  companyLicense: string;
  
  // Customer information (from quote.account/contact)
  customerName: string;
  customerCompany?: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress?: string;
  contactPerson?: string;
  
  // Project information (from quote)
  projectName?: string;
  projectAddress?: string;
  jobsiteAddress?: string;
  estimatedStartDate?: string;
  quoteNumber: string;
  
  // Template content (from template + real data)
  content: {
    companyDescription: string;
    proposalIntro: string;
    estimatedStartDate: string;
    qualifications: string;
    warranty: string;
    paymentTerms: string;
    additionalNotes: string;
  };
  
  // Branding (from template)
  branding: {
    primaryColor: string;
    accentColor: string;
    textColor: string;
    backgroundColor: string;
    logoSize: 'small' | 'medium' | 'large';
  };
}

/**
 * Maps a proposal template to actual EDG business data
 */
export function mapTemplateToData(
  template: ProposalTemplate, 
  quote: QuoteWithDetails
): MappedTemplateData {
  const defaultContent = template.defaultContent as DefaultContent || {};
  const brandingSettings = template.brandingSettings as any || {};
  
  // Get customer information
  const account = quote.account;
  // Note: contact info would need to be fetched separately using quote.contactId
  
  // Determine customer name from account
  const customerName = account?.name || 'Customer';
  
  // Contact person would need separate fetch - not available in QuoteWithDetails
  const contactPerson = undefined;

  return {
    // Company information (always EDG)
    companyName: COMPANY_INFO.name,
    companyAddress: COMPANY_INFO.address,
    companyPhone: COMPANY_INFO.phone,
    companyEmail: COMPANY_INFO.email,
    companyLicense: COMPANY_INFO.license,
    
    // Customer information from quote data
    customerName,
    customerCompany: account?.company || undefined,
    customerEmail: account?.email || '',
    customerPhone: account?.phone || '',
    customerAddress: account?.billingAddress || undefined,
    contactPerson,
    
    // Project information from quote
    projectName: quote.projectName || undefined,
    projectAddress: quote.projectAddress || undefined,
    jobsiteAddress: quote.jobsiteAddress || undefined,
    estimatedStartDate: quote.estimatedStartDate || undefined,
    quoteNumber: quote.quoteNumber,
    
    // Content - merge template defaults with real data where applicable
    content: {
      companyDescription: defaultContent.companyDescription || 
        'EDG Patio & Shade specializes in premium outdoor living solutions, including retractable awnings, pergolas, and custom shade structures.',
      
      proposalIntro: defaultContent.proposalIntro || 
        `This proposal outlines the recommended patio and shade solutions for ${quote.projectName || 'your outdoor living space'}.`,
      
      estimatedStartDate: defaultContent.estimatedStartDate || 
        (quote.estimatedStartDate 
          ? `Project is scheduled to begin on ${quote.estimatedStartDate}. Typical installations are completed within 2-3 weeks.`
          : 'Project timeline will be established upon contract execution. Typical installations are completed within 2-3 weeks.'),
      
      qualifications: defaultContent.qualifications || 
        'EDG Patio & Shade brings years of experience in outdoor living solutions with a focus on quality craftsmanship and customer satisfaction.',
      
      warranty: defaultContent.warranty || QUOTE_TERMS.warranty,
      
      paymentTerms: defaultContent.paymentTerms || 
        account?.paymentTerms || QUOTE_TERMS.paymentTerms,
      
      additionalNotes: defaultContent.additionalNotes || QUOTE_TERMS.additionalNotes
    },
    
    // Branding settings from template
    branding: {
      primaryColor: brandingSettings.primaryColor || '#3c3c3c',
      accentColor: brandingSettings.accentColor || '#42ffc1',
      textColor: brandingSettings.textColor || '#3c3c3c',
      backgroundColor: brandingSettings.backgroundColor || '#ffffff',
      logoSize: brandingSettings.logoSize || 'medium'
    }
  };
}

/**
 * Gets the default EDG template data for fallback when no template is selected
 */
export function getDefaultEDGTemplateData(quote: QuoteWithDetails): MappedTemplateData {
  const fallbackTemplate: Partial<ProposalTemplate> = {
    defaultContent: {
      companyDescription: 'EDG Patio & Shade specializes in premium outdoor living solutions, including retractable awnings, pergolas, and custom shade structures.',
      proposalIntro: 'This proposal outlines the recommended patio and shade solutions for your outdoor living space.',
      estimatedStartDate: 'Project timeline will be established upon contract execution. Typical installations are completed within 2-3 weeks.',
      qualifications: 'EDG Patio & Shade brings years of experience in outdoor living solutions with a focus on quality craftsmanship and customer satisfaction.',
      warranty: '1 year limited warranty on workmanship',
      paymentTerms: '50% deposit, 50% on completion',
      additionalNotes: 'Materials subject to availability. Permit costs not included.'
    },
    brandingSettings: {
      primaryColor: '#3c3c3c',
      accentColor: '#42ffc1', 
      textColor: '#3c3c3c',
      backgroundColor: '#ffffff',
      logoSize: 'medium'
    }
  };
  
  return mapTemplateToData(fallbackTemplate as ProposalTemplate, quote);
}