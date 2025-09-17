-- Migration to rename customers to accounts and add CRM features

-- 1. First rename the customers table to accounts
ALTER TABLE customers RENAME TO accounts;

-- 2. Add missing columns to accounts table
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type text DEFAULT 'homeowner' NOT NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payment_terms text DEFAULT 'net_30';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS billing_address text;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS created_at timestamp DEFAULT now();
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- 3. Create indexes on accounts table
CREATE INDEX IF NOT EXISTS idx_accounts_email ON accounts (email);
CREATE INDEX IF NOT EXISTS idx_accounts_phone ON accounts (phone);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts (account_type);

-- 4. Create contacts table
CREATE TABLE IF NOT EXISTS contacts (
    id serial PRIMARY KEY NOT NULL,
    account_id integer NOT NULL,
    first_name text NOT NULL,
    last_name text NOT NULL,
    email text NOT NULL,
    phone text,
    role text DEFAULT 'primary_contact' NOT NULL,
    is_primary boolean DEFAULT false,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

-- 5. Create indexes on contacts table
CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts (email);

-- 6. Rename customer_id to account_id in quotes table
ALTER TABLE quotes RENAME COLUMN customer_id TO account_id;

-- 7. Add missing columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS assigned_rep_id text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS jobsite_address text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS portfolio_images jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS technical_diagrams jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS company_images jsonb;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deal_stage text DEFAULT 'lead' NOT NULL;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lost_reason text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_at timestamp DEFAULT now();

-- 8. Create indexes on quotes table
CREATE INDEX IF NOT EXISTS idx_quotes_account_id ON quotes (account_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes (status);
CREATE INDEX IF NOT EXISTS idx_quotes_deal_stage ON quotes (deal_stage);
CREATE INDEX IF NOT EXISTS idx_quotes_assigned_rep ON quotes (assigned_rep_id);
CREATE INDEX IF NOT EXISTS idx_quotes_account_created ON quotes (account_id, created_at);

-- 9. Add retail_price column to line_items if missing
ALTER TABLE line_items ADD COLUMN IF NOT EXISTS retail_price numeric(10, 2);

-- 10. Create proposal_templates table if not exists
CREATE TABLE IF NOT EXISTS proposal_templates (
    id serial PRIMARY KEY NOT NULL,
    name text NOT NULL,
    description text,
    category text NOT NULL,
    template_type text DEFAULT 'pdf' NOT NULL,
    sections jsonb NOT NULL,
    layout_settings jsonb,
    branding_settings jsonb,
    default_content jsonb,
    is_active boolean DEFAULT true,
    is_default boolean DEFAULT false,
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now()
);

-- 11. Update products table with missing columns if needed
ALTER TABLE products ADD COLUMN IF NOT EXISTS primary_image text;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_images jsonb;
ALTER TABLE products ADD COLUMN IF NOT EXISTS specification_sheets jsonb;

-- 12. Create indexes on products table
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_product_type ON products (product_type);