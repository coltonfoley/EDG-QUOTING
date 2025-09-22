-- Migration to remove image fields from quotes table
-- These fields were removed from the schema but the migration wasn't generated
-- This migration documents the removal to prevent schema drift

-- Remove image fields that are no longer used
ALTER TABLE quotes DROP COLUMN IF EXISTS portfolio_images;
ALTER TABLE quotes DROP COLUMN IF EXISTS technical_diagrams;
ALTER TABLE quotes DROP COLUMN IF EXISTS company_images;