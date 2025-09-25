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
  // Static proposal images - consistent across all proposals
  proposalCoverImageUrl?: string;
  proposalFinalImageUrl?: string;
  // Social media handles
  instagram?: string;
  linkedin?: string;
}

export const COMPANY_INFO: CompanyInfo = {
  name: "EDG Patio & Shade",
  address: "1802 Holian Drive, Spring Grove, IL 60081",
  phone: "+1 (815) 581-0138",
  email: "info@edgpatioshade.com",
  license: "License #IL-PATIO-12345",
  // Static proposal images - these will be consistent across all proposals  
  proposalCoverImageUrl: '/assets/Logo_Full Color_Black_1758731429139.png',
  proposalFinalImageUrl: '/assets/Logo_Full Color_Black_1758731429139.png',
  instagram: '@edgpatioandshade',
  linkedin: 'EDG Patio & Shade'
} as const;

export const QUOTE_TERMS = {
  validFor: "30 days",
  paymentTerms: "50% deposit, 50% on completion",
  warranty: "1 year limited warranty on workmanship",
  additionalNotes: "Materials subject to availability. Permit costs not included.",
} as const;