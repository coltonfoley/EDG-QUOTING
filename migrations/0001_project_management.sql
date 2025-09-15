CREATE TYPE "public"."change_order_status" AS ENUM('draft', 'pending_approval', 'approved', 'rejected', 'implemented');--> statement-breakpoint
CREATE TYPE "public"."equipment_condition" AS ENUM('good', 'fair', 'needs_repair', 'broken');--> statement-breakpoint
CREATE TYPE "public"."equipment_status" AS ENUM('allocated', 'in_use', 'returned', 'maintenance');--> statement-breakpoint
CREATE TYPE "public"."milestone_status" AS ENUM('pending', 'in_progress', 'completed', 'overdue');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'urgent');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('planning', 'in_progress', 'on_hold', 'completed', 'billed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."resource_type" AS ENUM('crew_member', 'equipment', 'vehicle', 'external_contractor');--> statement-breakpoint
CREATE TYPE "public"."schedule_event_status" AS ENUM('scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'blocked', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."time_entry_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "account_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_account_role" UNIQUE("account_id","role")
);
--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"phone" text,
	"email" text,
	"billing_address" text,
	"shipping_address" text,
	"tags" jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" integer NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"description" text,
	"due_at" timestamp,
	"completed_at" timestamp,
	"assigned_to" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "contact_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"contact_id" integer NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_contact_role" UNIQUE("contact_id","role")
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"title" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"description" text NOT NULL,
	"user_id" varchar,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"company" text,
	"status" text DEFAULT 'new' NOT NULL,
	"source" text,
	"value" numeric(12, 2),
	"notes" text,
	"assigned_to" varchar,
	"customer_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer NOT NULL,
	"primary_contact_id" integer,
	"name" text NOT NULL,
	"stage" text DEFAULT 'inquiry' NOT NULL,
	"amount" numeric(12, 2),
	"expected_close_date" timestamp,
	"source" text,
	"assigned_to" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_budget_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"cost_code" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" text DEFAULT 'each' NOT NULL,
	"estimated_unit_cost" numeric(10, 2) NOT NULL,
	"estimated_total_cost" numeric(12, 2) NOT NULL,
	"actual_quantity" numeric(10, 2) DEFAULT '0',
	"actual_unit_cost" numeric(10, 2) DEFAULT '0',
	"actual_total_cost" numeric(12, 2) DEFAULT '0',
	"linked_line_item_id" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_change_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"change_order_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"reason" text,
	"labor_cost_change" numeric(12, 2) DEFAULT '0',
	"material_cost_change" numeric(12, 2) DEFAULT '0',
	"equipment_cost_change" numeric(12, 2) DEFAULT '0',
	"total_cost_change" numeric(12, 2) NOT NULL,
	"schedule_impact_days" integer DEFAULT 0,
	"status" "change_order_status" DEFAULT 'draft' NOT NULL,
	"requested_by" varchar,
	"request_date" timestamp DEFAULT now(),
	"client_approval_required" boolean DEFAULT true,
	"client_approved_by" integer,
	"client_approved_at" timestamp,
	"client_signature" text,
	"internal_approved_by" varchar,
	"internal_approved_at" timestamp,
	"implemented_by" varchar,
	"implemented_at" timestamp,
	"attachments" jsonb,
	"impacted_tasks" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "project_change_orders_change_order_number_unique" UNIQUE("change_order_number")
);
--> statement-breakpoint
CREATE TABLE "project_crew" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" varchar,
	"external_contractor_name" text,
	"role" text NOT NULL,
	"skill_set" jsonb,
	"hourly_rate" numeric(8, 2),
	"start_date" timestamp,
	"end_date" timestamp,
	"is_active" boolean DEFAULT true,
	"phone" text,
	"email" text,
	"company" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"equipment_name" text NOT NULL,
	"equipment_type" text,
	"description" text,
	"serial_number" text,
	"allocated_date" timestamp NOT NULL,
	"return_date" timestamp,
	"daily_rate" numeric(8, 2),
	"total_cost" numeric(10, 2),
	"status" text DEFAULT 'allocated' NOT NULL,
	"condition" text,
	"assigned_to" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_financials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"original_estimated_labor" numeric(12, 2) DEFAULT '0',
	"original_estimated_materials" numeric(12, 2) DEFAULT '0',
	"original_estimated_equipment" numeric(12, 2) DEFAULT '0',
	"original_estimated_total" numeric(12, 2) DEFAULT '0',
	"current_estimated_labor" numeric(12, 2) DEFAULT '0',
	"current_estimated_materials" numeric(12, 2) DEFAULT '0',
	"current_estimated_equipment" numeric(12, 2) DEFAULT '0',
	"current_estimated_total" numeric(12, 2) DEFAULT '0',
	"actual_labor_cost" numeric(12, 2) DEFAULT '0',
	"actual_material_cost" numeric(12, 2) DEFAULT '0',
	"actual_equipment_cost" numeric(12, 2) DEFAULT '0',
	"actual_total_cost" numeric(12, 2) DEFAULT '0',
	"total_change_order_value" numeric(12, 2) DEFAULT '0',
	"approved_change_order_value" numeric(12, 2) DEFAULT '0',
	"total_billed_amount" numeric(12, 2) DEFAULT '0',
	"total_paid_amount" numeric(12, 2) DEFAULT '0',
	"retainage_amount" numeric(12, 2) DEFAULT '0',
	"gross_profit" numeric(12, 2),
	"gross_margin_percentage" numeric(5, 2),
	"cost_variance" numeric(12, 2),
	"cost_variance_percentage" numeric(5, 2),
	"last_updated" timestamp DEFAULT now(),
	"calculated_by" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_project_financial" UNIQUE("project_id")
);
--> statement-breakpoint
CREATE TABLE "project_line_item_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"line_item_id" integer NOT NULL,
	"task_id" integer,
	"budget_line_id" integer,
	"conversion_notes" text,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_project_line_item_link" UNIQUE("project_id","line_item_id")
);
--> statement-breakpoint
CREATE TABLE "project_material_receipts" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"purchase_order_id" integer,
	"material_id" integer,
	"receipt_number" text NOT NULL,
	"delivery_date" timestamp NOT NULL,
	"quantity_ordered" numeric(10, 2) NOT NULL,
	"quantity_received" numeric(10, 2) NOT NULL,
	"quantity_accepted" numeric(10, 2) NOT NULL,
	"quantity_rejected" numeric(10, 2) DEFAULT '0',
	"rejection_reason" text,
	"condition" text DEFAULT 'good' NOT NULL,
	"received_by" varchar,
	"inspected_by" varchar,
	"storage_location" text,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_materials" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"task_id" integer,
	"product_id" integer,
	"material_name" text NOT NULL,
	"material_type" text,
	"quantity_ordered" numeric(10, 2),
	"quantity_delivered" numeric(10, 2),
	"quantity_used" numeric(10, 2),
	"quantity_returned" numeric(10, 2) DEFAULT '0',
	"quantity_wasted" numeric(10, 2) DEFAULT '0',
	"unit" text DEFAULT 'each',
	"unit_cost" numeric(10, 2),
	"total_cost" numeric(12, 2),
	"order_date" timestamp,
	"expected_delivery_date" timestamp,
	"actual_delivery_date" timestamp,
	"usage_date" timestamp,
	"supplier_name" text,
	"supplier_order_number" text,
	"invoice_number" text,
	"description" text,
	"specifications" text,
	"lot_number" text,
	"warranty_period" text,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_milestones" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_date" timestamp NOT NULL,
	"actual_date" timestamp,
	"status" "milestone_status" DEFAULT 'pending' NOT NULL,
	"completion_percentage" integer DEFAULT 0,
	"is_client_approval_required" boolean DEFAULT false,
	"client_approved_at" timestamp,
	"client_approved_by" integer,
	"display_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_progress" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"task_id" integer,
	"milestone_id" integer,
	"entry_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"photos" jsonb,
	"documents" jsonb,
	"weather_conditions" text,
	"work_conditions" text,
	"crew_present" jsonb,
	"hours_worked" numeric(6, 2),
	"quality_issues" text,
	"safety_incidents" text,
	"client_present" boolean DEFAULT false,
	"client_feedback" text,
	"entry_date" timestamp NOT NULL,
	"created_by" varchar,
	"is_visible" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"po_number" text NOT NULL,
	"supplier_name" text NOT NULL,
	"supplier_contact" text,
	"supplier_phone" text,
	"supplier_email" text,
	"order_date" timestamp NOT NULL,
	"expected_delivery_date" timestamp,
	"actual_delivery_date" timestamp,
	"status" text DEFAULT 'pending' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0',
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "project_purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "project_schedule_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"task_id" integer,
	"resource_type" "resource_type" NOT NULL,
	"resource_id" integer NOT NULL,
	"title" text NOT NULL,
	"start_date_time" timestamp NOT NULL,
	"end_date_time" timestamp NOT NULL,
	"status" "schedule_event_status" DEFAULT 'scheduled' NOT NULL,
	"is_all_day" boolean DEFAULT false,
	"location" text,
	"notes" text,
	"created_by" varchar,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_task_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"crew_member_id" integer,
	"user_id" varchar,
	"role" text NOT NULL,
	"planned_hours" numeric(8, 2),
	"actual_hours" numeric(8, 2),
	"planned_start_date" timestamp,
	"planned_end_date" timestamp,
	"actual_start_date" timestamp,
	"actual_end_date" timestamp,
	"hourly_rate" numeric(8, 2),
	"is_active" boolean DEFAULT true,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_task_crew_assignment" UNIQUE("task_id","crew_member_id"),
	CONSTRAINT "unique_task_user_assignment" UNIQUE("task_id","user_id"),
	CONSTRAINT "crew_or_user_not_both" CHECK ((crew_member_id IS NULL AND user_id IS NOT NULL) OR (crew_member_id IS NOT NULL AND user_id IS NULL))
);
--> statement-breakpoint
CREATE TABLE "project_task_dependencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"depends_on_task_id" integer NOT NULL,
	"dependency_type" text DEFAULT 'finish_to_start' NOT NULL,
	"lag_days" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "unique_task_dependency" UNIQUE("task_id","depends_on_task_id")
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"parent_task_id" integer,
	"milestone_id" integer,
	"task_number" text,
	"title" text NOT NULL,
	"description" text,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"estimated_start_date" timestamp,
	"actual_start_date" timestamp,
	"estimated_end_date" timestamp,
	"actual_end_date" timestamp,
	"estimated_hours" numeric(8, 2),
	"actual_hours" numeric(8, 2),
	"estimated_cost" numeric(10, 2),
	"actual_cost" numeric(10, 2),
	"assigned_to" varchar,
	"completion_percentage" integer DEFAULT 0,
	"task_type" text,
	"requires_client_presence" boolean DEFAULT false,
	"requires_permits" boolean DEFAULT false,
	"display_order" integer DEFAULT 0,
	"custom_fields" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "project_time_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"task_id" integer,
	"crew_member_id" integer,
	"user_id" varchar,
	"work_date" timestamp NOT NULL,
	"start_time" timestamp,
	"end_time" timestamp,
	"hours_worked" numeric(6, 2) NOT NULL,
	"break_hours" numeric(6, 2) DEFAULT '0',
	"hourly_rate" numeric(8, 2),
	"labor_cost" numeric(10, 2),
	"overtime_hours" numeric(6, 2) DEFAULT '0',
	"overtime_rate" numeric(8, 2),
	"work_description" text NOT NULL,
	"work_type" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" varchar,
	"approved_at" timestamp,
	"entered_by" varchar,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"quote_id" integer NOT NULL,
	"opportunity_id" integer,
	"account_id" integer NOT NULL,
	"primary_contact_id" integer,
	"project_number" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" "project_status" DEFAULT 'planning' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"project_address" text,
	"estimated_start_date" timestamp,
	"actual_start_date" timestamp,
	"estimated_end_date" timestamp,
	"actual_end_date" timestamp,
	"project_manager_id" varchar,
	"estimated_total_cost" numeric(12, 2),
	"actual_total_cost" numeric(12, 2),
	"custom_fields" jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "projects_project_number_unique" UNIQUE("project_number")
);
--> statement-breakpoint
CREATE TABLE "proposal_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"template_type" text DEFAULT 'pdf' NOT NULL,
	"sections" jsonb NOT NULL,
	"layout_settings" jsonb,
	"branding_settings" jsonb,
	"default_content" jsonb,
	"is_active" boolean DEFAULT true,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp,
	"completed" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to" varchar,
	"created_at" timestamp DEFAULT now(),
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DATA TYPE varchar;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();--> statement-breakpoint
ALTER TABLE "line_items" ADD COLUMN "retail_price" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "pricing_tables" ADD COLUMN "retail_price" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "primary_image" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "gallery_images" jsonb;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "specification_sheets" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "opportunity_id" integer;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "project_images" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "portfolio_images" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "technical_diagrams" jsonb;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "company_images" jsonb;--> statement-breakpoint
ALTER TABLE "account_roles" ADD CONSTRAINT "account_roles_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_budget_lines" ADD CONSTRAINT "project_budget_lines_linked_line_item_id_line_items_id_fk" FOREIGN KEY ("linked_line_item_id") REFERENCES "public"."line_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_client_approved_by_contacts_id_fk" FOREIGN KEY ("client_approved_by") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_internal_approved_by_users_id_fk" FOREIGN KEY ("internal_approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_change_orders" ADD CONSTRAINT "project_change_orders_implemented_by_users_id_fk" FOREIGN KEY ("implemented_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_crew" ADD CONSTRAINT "project_crew_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_crew" ADD CONSTRAINT "project_crew_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_equipment" ADD CONSTRAINT "project_equipment_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_financials" ADD CONSTRAINT "project_financials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_financials" ADD CONSTRAINT "project_financials_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_line_item_links" ADD CONSTRAINT "project_line_item_links_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_line_item_links" ADD CONSTRAINT "project_line_item_links_line_item_id_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."line_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_line_item_links" ADD CONSTRAINT "project_line_item_links_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_line_item_links" ADD CONSTRAINT "project_line_item_links_budget_line_id_project_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."project_budget_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_purchase_order_id_project_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."project_purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_material_id_project_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."project_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_received_by_users_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_material_receipts" ADD CONSTRAINT "project_material_receipts_inspected_by_users_id_fk" FOREIGN KEY ("inspected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_materials" ADD CONSTRAINT "project_materials_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_milestones" ADD CONSTRAINT "project_milestones_client_approved_by_contacts_id_fk" FOREIGN KEY ("client_approved_by") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_progress" ADD CONSTRAINT "project_progress_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_progress" ADD CONSTRAINT "project_progress_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_progress" ADD CONSTRAINT "project_progress_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_progress" ADD CONSTRAINT "project_progress_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchase_orders" ADD CONSTRAINT "project_purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_purchase_orders" ADD CONSTRAINT "project_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedule_events" ADD CONSTRAINT "project_schedule_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedule_events" ADD CONSTRAINT "project_schedule_events_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_schedule_events" ADD CONSTRAINT "project_schedule_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_assignments" ADD CONSTRAINT "project_task_assignments_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_assignments" ADD CONSTRAINT "project_task_assignments_crew_member_id_project_crew_id_fk" FOREIGN KEY ("crew_member_id") REFERENCES "public"."project_crew"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_assignments" ADD CONSTRAINT "project_task_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_task_dependencies" ADD CONSTRAINT "project_task_dependencies_depends_on_task_id_project_tasks_id_fk" FOREIGN KEY ("depends_on_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_parent_task_id_project_tasks_id_fk" FOREIGN KEY ("parent_task_id") REFERENCES "public"."project_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_milestone_id_project_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."project_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_crew_member_id_project_crew_id_fk" FOREIGN KEY ("crew_member_id") REFERENCES "public"."project_crew"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_time_entries" ADD CONSTRAINT "project_time_entries_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_contact_id_contacts_id_fk" FOREIGN KEY ("primary_contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_manager_id_users_id_fk" FOREIGN KEY ("project_manager_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_budget_lines_project_id" ON "project_budget_lines" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_budget_lines_cost_code" ON "project_budget_lines" USING btree ("cost_code");--> statement-breakpoint
CREATE INDEX "idx_budget_lines_category" ON "project_budget_lines" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_budget_lines_linked_line_item" ON "project_budget_lines" USING btree ("linked_line_item_id");--> statement-breakpoint
CREATE INDEX "idx_line_item_links_project_id" ON "project_line_item_links" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_line_item_links_line_item_id" ON "project_line_item_links" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "idx_line_item_links_task_id" ON "project_line_item_links" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_line_item_links_budget_line_id" ON "project_line_item_links" USING btree ("budget_line_id");--> statement-breakpoint
CREATE INDEX "idx_material_receipts_project_id" ON "project_material_receipts" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_material_receipts_purchase_order_id" ON "project_material_receipts" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "idx_material_receipts_delivery_date" ON "project_material_receipts" USING btree ("delivery_date");--> statement-breakpoint
CREATE INDEX "idx_material_receipts_material_id" ON "project_material_receipts" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "idx_project_milestones_project_id" ON "project_milestones" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_milestones_status" ON "project_milestones" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_milestones_target_date" ON "project_milestones" USING btree ("target_date");--> statement-breakpoint
CREATE INDEX "idx_project_milestones_project_display" ON "project_milestones" USING btree ("project_id","display_order");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_project_id" ON "project_purchase_orders" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_status" ON "project_purchase_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_order_date" ON "project_purchase_orders" USING btree ("order_date");--> statement-breakpoint
CREATE INDEX "idx_purchase_orders_expected_delivery" ON "project_purchase_orders" USING btree ("expected_delivery_date");--> statement-breakpoint
CREATE INDEX "idx_schedule_events_project_id" ON "project_schedule_events" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_events_start_end" ON "project_schedule_events" USING btree ("start_date_time","end_date_time");--> statement-breakpoint
CREATE INDEX "idx_schedule_events_resource" ON "project_schedule_events" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "idx_schedule_events_resource_start_end" ON "project_schedule_events" USING btree ("resource_type","resource_id","start_date_time","end_date_time");--> statement-breakpoint
CREATE INDEX "idx_schedule_events_status" ON "project_schedule_events" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_task_assignments_task_id" ON "project_task_assignments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignments_crew_member_id" ON "project_task_assignments" USING btree ("crew_member_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignments_user_id" ON "project_task_assignments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_task_assignments_planned_start" ON "project_task_assignments" USING btree ("planned_start_date");--> statement-breakpoint
CREATE INDEX "idx_task_dependencies_task_id" ON "project_task_dependencies" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_task_dependencies_depends_on" ON "project_task_dependencies" USING btree ("depends_on_task_id");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project_id" ON "project_tasks" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_parent_task_id" ON "project_tasks" USING btree ("parent_task_id");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_status" ON "project_tasks" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_display_order" ON "project_tasks" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_project_status" ON "project_tasks" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_assigned_to" ON "project_tasks" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_estimated_start" ON "project_tasks" USING btree ("estimated_start_date");--> statement-breakpoint
CREATE INDEX "idx_project_tasks_priority_status" ON "project_tasks" USING btree ("priority","status");--> statement-breakpoint
CREATE INDEX "idx_projects_status" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_projects_account_id" ON "projects" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "idx_projects_project_manager_id" ON "projects" USING btree ("project_manager_id");--> statement-breakpoint
CREATE INDEX "idx_projects_estimated_start_date" ON "projects" USING btree ("estimated_start_date");--> statement-breakpoint
CREATE INDEX "idx_projects_priority_status" ON "projects" USING btree ("priority","status");--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;