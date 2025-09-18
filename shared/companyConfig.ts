/**
 * Centralized company information configuration
 * Single source of truth for all company details used across the application
 */

export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  license: string;
}

export const COMPANY_INFO: CompanyInfo = {
  name: "Rainmaker, by EDG",
  address: "123 Patio Drive, Shade City, SC 12345",
  phone: "(555) 123-4567",
  email: "info@edgpatioandshade.com",
  license: "License #SC-12345",
} as const;

export const QUOTE_TERMS = {
  validFor: "30 days",
  paymentTerms: "50% deposit, 50% on completion",
  warranty: "1 year limited warranty on workmanship",
  additionalNotes: "Materials subject to availability. Permit costs not included.",
} as const;