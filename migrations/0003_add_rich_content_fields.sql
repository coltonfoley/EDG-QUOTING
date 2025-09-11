-- Add rich content fields to quotes table for enhanced proposals
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS project_scope TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS timeline TEXT; 
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS company_overview TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS technical_specs TEXT;