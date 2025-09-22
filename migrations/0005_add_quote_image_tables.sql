-- 0005_add_quote_image_tables.sql
-- Add new tables for quote image management: cover photos and product renderings

CREATE TABLE IF NOT EXISTS quote_cover_photos (
  id serial PRIMARY KEY,
  quote_id integer NOT NULL,
  filename text NOT NULL,
  original_name text NOT NULL,
  storage_url text NOT NULL,
  file_size integer,
  mime_type text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  uploaded_at timestamp DEFAULT now()
);

-- Indexes for quote_cover_photos
CREATE INDEX IF NOT EXISTS idx_quote_cover_photos_quote_id ON quote_cover_photos (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_cover_photos_active ON quote_cover_photos (is_active);

CREATE TABLE IF NOT EXISTS quote_product_renderings (
  id serial PRIMARY KEY,
  quote_id integer NOT NULL,
  filename text NOT NULL,
  original_name text NOT NULL,
  storage_url text NOT NULL,
  display_order integer DEFAULT 0,
  file_size integer,
  mime_type text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  uploaded_at timestamp DEFAULT now()
);

-- Indexes for quote_product_renderings
CREATE INDEX IF NOT EXISTS idx_quote_product_renderings_quote_id ON quote_product_renderings (quote_id);
CREATE INDEX IF NOT EXISTS idx_quote_product_renderings_active ON quote_product_renderings (is_active);
CREATE INDEX IF NOT EXISTS idx_quote_product_renderings_order ON quote_product_renderings (quote_id, display_order);