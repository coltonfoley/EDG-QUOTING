-- Add manufacturer discount columns to products table
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_discount_type text NOT NULL DEFAULT 'percentage';
ALTER TABLE products ADD COLUMN IF NOT EXISTS default_discount_value numeric(10,2) NOT NULL DEFAULT '0';

-- Add manufacturer discount columns to line_items table  
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS discount_type text NOT NULL DEFAULT 'percentage';
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS discount_value numeric(10,2) NOT NULL DEFAULT '0';