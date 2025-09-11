-- Create proposal_templates table for different proposal layouts and content structures
CREATE TABLE IF NOT EXISTS proposal_templates (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL, -- basic_quote, full_proposal, executive_summary, technical_spec
    template_type TEXT NOT NULL DEFAULT 'pdf', -- pdf, html, email
    sections JSONB NOT NULL, -- Array of section configurations
    layout_settings JSONB, -- Layout preferences, spacing, page settings
    branding_settings JSONB, -- Colors, logos, fonts
    default_content JSONB, -- Default text and placeholders for sections
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add constraints to ensure only one default template at a time
CREATE UNIQUE INDEX IF NOT EXISTS unique_default_proposal_template 
ON proposal_templates (is_default) 
WHERE is_default = TRUE;

-- Add trigger to automatically update updated_at field
CREATE OR REPLACE FUNCTION update_updated_at_proposal_templates()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_proposal_templates_updated_at
    BEFORE UPDATE ON proposal_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_proposal_templates();