CREATE TABLE "contract_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"title" text DEFAULT 'Service Agreement' NOT NULL,
	"terms" text NOT NULL,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text NOT NULL,
	"company" text
);
--> statement-breakpoint
CREATE TABLE "line_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"product_id" integer,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"markup_type" text NOT NULL,
	"markup_value" numeric(10, 2) NOT NULL,
	"discount_type" text DEFAULT 'percentage' NOT NULL,
	"discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"config_data" jsonb,
	"base_product_id" integer,
	"is_accessory" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "pricing_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"length_min" numeric(8, 2) NOT NULL,
	"length_max" numeric(8, 2) NOT NULL,
	"width_min" numeric(8, 2) NOT NULL,
	"width_max" numeric(8, 2) NOT NULL,
	"base_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_accessories" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_product_id" integer NOT NULL,
	"accessory_product_id" integer NOT NULL,
	"is_required" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"category" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text,
	"product_type" text DEFAULT 'simple' NOT NULL,
	"default_unit_price" numeric(10, 2) NOT NULL,
	"default_markup_type" text DEFAULT 'percentage' NOT NULL,
	"default_markup_value" numeric(10, 2) DEFAULT '25' NOT NULL,
	"default_discount_type" text DEFAULT 'percentage' NOT NULL,
	"default_discount_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unit" text DEFAULT 'each',
	"config_fields" jsonb,
	"min_length" numeric(8, 2),
	"max_length" numeric(8, 2),
	"min_width" numeric(8, 2),
	"max_width" numeric(8, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_number" text NOT NULL,
	"customer_id" integer NOT NULL,
	"project_name" text,
	"project_address" text,
	"estimated_start_date" text,
	"notes" text,
	"tax_rate" numeric(5, 2) DEFAULT '0',
	"discount" numeric(5, 2) DEFAULT '0',
	"shipping" numeric(10, 2) DEFAULT '0',
	"status" text DEFAULT 'draft' NOT NULL,
	"contract_template_id" integer,
	"custom_contract_terms" text,
	"issuer_signature" text,
	"issuer_signature_date" timestamp,
	"customer_signature" text,
	"customer_signature_date" timestamp,
	"signature_status" text DEFAULT 'unsigned' NOT NULL,
	"docusign_envelope_id" text,
	"docusign_status" text,
	"docusign_sent_date" timestamp,
	"docusign_view_url" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "quotes_quote_number_unique" UNIQUE("quote_number")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar NOT NULL,
	"password" varchar NOT NULL,
	"email" varchar,
	"first_name" varchar,
	"last_name" varchar,
	"role" varchar DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE INDEX "IDX_session_expire" ON "sessions" USING btree ("expire");