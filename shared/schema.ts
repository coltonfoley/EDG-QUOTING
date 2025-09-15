import { pgTable, text, serial, integer, decimal, timestamp, boolean, varchar, jsonb, index, unique, pgEnum, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { sql } from "drizzle-orm";

// Define enums for better data integrity and performance
export const projectStatusEnum = pgEnum('project_status', ['planning', 'in_progress', 'on_hold', 'completed', 'billed', 'cancelled']);
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in_progress', 'completed', 'blocked', 'cancelled']);
export const milestoneStatusEnum = pgEnum('milestone_status', ['pending', 'in_progress', 'completed', 'overdue']);
export const priorityEnum = pgEnum('priority', ['low', 'medium', 'high', 'urgent']);
export const changeOrderStatusEnum = pgEnum('change_order_status', ['draft', 'pending_approval', 'approved', 'rejected', 'implemented']);
export const timeEntryStatusEnum = pgEnum('time_entry_status', ['pending', 'approved', 'rejected']);
export const equipmentStatusEnum = pgEnum('equipment_status', ['allocated', 'in_use', 'returned', 'maintenance']);
export const equipmentConditionEnum = pgEnum('equipment_condition', ['good', 'fair', 'needs_repair', 'broken']);
export const resourceTypeEnum = pgEnum('resource_type', ['crew_member', 'equipment', 'vehicle', 'external_contractor']);
export const scheduleEventStatusEnum = pgEnum('schedule_event_status', ['scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled']);

// Session storage table.
// (IMPORTANT) This table is mandatory for Replit Auth, don't drop it.
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for username/password authentication
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique().notNull(),
  password: varchar("password").notNull(), // NOTE: Should be hashed using bcrypt or similar before storing
  email: varchar("email"),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  role: varchar("role").notNull().default("user"), // admin, user
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  company: text("company"), // Company name for business clients
});

// Comprehensive CRM System Tables

// Accounts - Companies or individuals  
export const accounts = pgTable("accounts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'company' | 'individual'
  phone: text("phone"),
  email: text("email"),
  billingAddress: text("billing_address"),
  shippingAddress: text("shipping_address"),
  tags: jsonb("tags"), // Array of tags for categorization
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Account roles - accounts can have multiple roles
export const accountRoles = pgTable("account_roles", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // 'lead' | 'client' | 'vendor' | 'contractor' | 'supplier'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_account_role").on(table.accountId, table.role),
]);

// Contacts - individual people within accounts
export const contacts = pgTable("contacts", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  title: text("title"), // job title/position
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Contact roles - contacts can have specific roles that may differ from account roles
export const contactRoles = pgTable("contact_roles", {
  id: serial("id").primaryKey(),
  contactId: integer("contact_id").notNull().references(() => contacts.id, { onDelete: 'cascade' }),
  role: text("role").notNull(), // 'lead' | 'client' | 'vendor' | 'contractor' | 'supplier'
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_contact_role").on(table.contactId, table.role),
]);

// Opportunities - sales opportunities/projects
export const opportunities = pgTable("opportunities", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }),
  primaryContactId: integer("primary_contact_id").references(() => contacts.id, { onDelete: 'set null' }),
  name: text("name").notNull(),
  stage: text("stage").notNull().default("inquiry"), // 'inquiry' | 'estimating' | 'proposal_sent' | 'contract_signed' | 'project_complete' | 'closed_lost'
  amount: decimal("amount", { precision: 12, scale: 2 }), // estimated/actual project value
  expectedCloseDate: timestamp("expected_close_date"),
  source: text("source"), // web, referral, cold_call, trade_show, social_media, etc.
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Polymorphic activities table - can link to accounts, contacts, or opportunities
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  entityType: text("entity_type").notNull(), // 'account' | 'contact' | 'opportunity'
  entityId: integer("entity_id").notNull(),
  type: text("type").notNull(), // 'call' | 'email' | 'meeting' | 'task' | 'note' | 'quote_sent' | 'proposal_sent' | 'contract_signed'
  summary: text("summary").notNull(),
  description: text("description"), // optional detailed description
  dueAt: timestamp("due_at"), // for tasks/scheduled activities
  completedAt: timestamp("completed_at"), // when completed
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const quotes = pgTable("quotes", {
  id: serial("id").primaryKey(),
  quoteNumber: text("quote_number").notNull().unique(),
  customerId: integer("customer_id").notNull(),
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: 'set null' }), // link to opportunity
  projectName: text("project_name"),
  projectAddress: text("project_address"),
  estimatedStartDate: text("estimated_start_date"),
  notes: text("notes"),
  // Image fields for comprehensive image integration
  projectImages: jsonb("project_images"), // Array of project photo URLs and metadata
  portfolioImages: jsonb("portfolio_images"), // Array of selected portfolio showcase images
  technicalDiagrams: jsonb("technical_diagrams"), // Array of technical diagrams and plans
  companyImages: jsonb("company_images"), // Company branding and team photos
  taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default("0"),
  discount: decimal("discount", { precision: 5, scale: 2 }).default("0"),
  shipping: decimal("shipping", { precision: 10, scale: 2 }).default("0"),
  status: text("status").notNull().default("draft"), // draft, sent, approved, rejected
  // Contract and signature fields
  contractTemplateId: integer("contract_template_id"), // reference to contract template
  customContractTerms: text("custom_contract_terms"), // custom contract text for this quote
  issuerSignature: text("issuer_signature"), // issuer signature (name)
  issuerSignatureDate: timestamp("issuer_signature_date"),
  customerSignature: text("customer_signature"), // customer signature (name)
  customerSignatureDate: timestamp("customer_signature_date"),
  signatureStatus: text("signature_status").notNull().default("unsigned"), // unsigned, signed
  // DocuSign integration fields
  docusignEnvelopeId: text("docusign_envelope_id"), // DocuSign envelope ID
  docusignStatus: text("docusign_status"), // created, sent, delivered, signed, completed, declined, voided
  docusignSentDate: timestamp("docusign_sent_date"), // when envelope was sent to customer
  docusignViewUrl: text("docusign_view_url"), // URL for customer to view/sign document
  createdAt: timestamp("created_at").defaultNow(),
});

// Contract templates for reusable contract terms
export const contractTemplates = pgTable("contract_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  title: text("title").notNull().default("Service Agreement"),
  terms: text("terms").notNull(),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Proposal templates for different proposal layouts and content structures
export const proposalTemplates = pgTable("proposal_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category").notNull(), // basic_quote, full_proposal, executive_summary, technical_spec
  templateType: text("template_type").notNull().default("pdf"), // pdf, html, email
  // Layout configuration  
  sections: jsonb("sections").notNull(), // Array of section configurations
  layoutSettings: jsonb("layout_settings"), // Layout preferences, spacing, page settings
  // Visual settings
  brandingSettings: jsonb("branding_settings"), // Colors, logos, fonts
  // Default content
  defaultContent: jsonb("default_content"), // Default text and placeholders for sections
  // Template status
  isActive: boolean("is_active").default(true),
  isDefault: boolean("is_default").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  category: text("category"),
  productType: text("product_type").notNull().default("simple"), // simple, configurable
  defaultUnitPrice: decimal("default_unit_price", { precision: 10, scale: 2 }).notNull(),
  defaultMarkupType: text("default_markup_type").notNull().default("percentage"),
  defaultMarkupValue: decimal("default_markup_value", { precision: 10, scale: 2 }).notNull().default("25"),
  defaultDiscountType: text("default_discount_type").notNull().default("percentage"),
  defaultDiscountValue: decimal("default_discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  unit: text("unit").default("each"), // each, sq ft, linear ft, cubic yard, etc.
  // Configuration fields for configurable products
  configFields: jsonb("config_fields"), // JSON array of configuration field definitions
  minLength: decimal("min_length", { precision: 8, scale: 2 }), // for dimensional products
  maxLength: decimal("max_length", { precision: 8, scale: 2 }),
  minWidth: decimal("min_width", { precision: 8, scale: 2 }),
  maxWidth: decimal("max_width", { precision: 8, scale: 2 }),
  // Image fields for product visualization
  primaryImage: text("primary_image"), // Main product image URL
  galleryImages: jsonb("gallery_images"), // Array of additional product photos
  specificationSheets: jsonb("specification_sheets"), // Technical specification documents/images
  createdAt: timestamp("created_at").defaultNow(),
});

// Dimensional pricing tables for configurable products
export const pricingTables = pgTable("pricing_tables", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull(),
  // Length band range
  lengthMin: decimal("length_min", { precision: 8, scale: 2 }).notNull(),
  lengthMax: decimal("length_max", { precision: 8, scale: 2 }).notNull(),
  // Width band range  
  widthMin: decimal("width_min", { precision: 8, scale: 2 }).notNull(),
  widthMax: decimal("width_max", { precision: 8, scale: 2 }).notNull(),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }).notNull(),
  basePrice: decimal("base_price", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Product accessories - items that can be added to base products
export const productAccessories = pgTable("product_accessories", {
  id: serial("id").primaryKey(),
  baseProductId: integer("base_product_id").notNull(), // the main product (e.g., Brustor B200xl)
  accessoryProductId: integer("accessory_product_id").notNull(), // the accessory product
  isRequired: boolean("is_required").default(false),
  displayOrder: integer("display_order").default(0),
  category: text("category"), // e.g., "Motors", "Lighting", "Sensors"
  createdAt: timestamp("created_at").defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull(),
  productId: integer("product_id"), // optional reference to product catalog
  description: text("description").notNull(),
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  retailPrice: decimal("retail_price", { precision: 10, scale: 2 }), // manufacturer's suggested retail price
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull(),
  markupType: text("markup_type").notNull(), // percentage, dollar
  markupValue: decimal("markup_value", { precision: 10, scale: 2 }).notNull(),
  discountType: text("discount_type").notNull().default("percentage"), // percentage, dollar
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).notNull().default("0"),
  // Configuration data for configurable products
  configData: jsonb("config_data"), // JSON object storing configuration values (dimensions, options, etc.)
  baseProductId: integer("base_product_id"), // reference to base product for accessories
  isAccessory: boolean("is_accessory").default(false),
});

// Original CRM Lead Management Tables (keeping for backward compatibility)
export const leads = pgTable("leads", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email"),
  phone: text("phone"),
  company: text("company"),
  status: text("status").notNull().default("new"), // new, contacted, quoted, won, lost
  source: text("source"), // web, referral, cold_call, trade_show, social_media, etc.
  value: decimal("value", { precision: 12, scale: 2 }), // estimated project value
  notes: text("notes"),
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }), // foreign key to users table
  customerId: integer("customer_id"), // optional link to customer when lead converts
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(), // foreign key to leads table
  title: text("title").notNull(),
  description: text("description"),
  dueDate: timestamp("due_date"),
  completed: boolean("completed").notNull().default(false),
  priority: text("priority").notNull().default("medium"), // low, medium, high
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }), // foreign key to users table
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const leadActivities = pgTable("lead_activities", {
  id: serial("id").primaryKey(),
  leadId: integer("lead_id").notNull(), // foreign key to leads table
  activityType: text("activity_type").notNull(), // status_change, task_completed, note_added, email_sent, call_made, meeting_scheduled, quote_sent, etc.
  description: text("description").notNull(),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // which user performed the activity
  metadata: jsonb("metadata"), // additional activity-specific data
  createdAt: timestamp("created_at").defaultNow(),
});

// Project Management System Tables

// Core projects table - manages approved quotes converted to active projects
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  quoteId: integer("quote_id").notNull().references(() => quotes.id, { onDelete: 'cascade' }), // reference to approved quote
  opportunityId: integer("opportunity_id").references(() => opportunities.id, { onDelete: 'set null' }), // link to original opportunity
  accountId: integer("account_id").notNull().references(() => accounts.id, { onDelete: 'cascade' }), // client account
  primaryContactId: integer("primary_contact_id").references(() => contacts.id, { onDelete: 'set null' }), // main client contact
  projectNumber: text("project_number").notNull().unique(), // unique project identifier
  name: text("name").notNull(), // project name/title
  description: text("description"), // detailed project description
  status: projectStatusEnum("status").notNull().default("planning"), // planning, in_progress, on_hold, completed, billed, cancelled
  priority: priorityEnum("priority").notNull().default("medium"), // low, medium, high, urgent
  // Location and scheduling
  projectAddress: text("project_address"), // work site address
  estimatedStartDate: timestamp("estimated_start_date"), // planned start date
  actualStartDate: timestamp("actual_start_date"), // when work actually began
  estimatedEndDate: timestamp("estimated_end_date"), // planned completion
  actualEndDate: timestamp("actual_end_date"), // actual completion date
  // Project management
  projectManagerId: varchar("project_manager_id").references(() => users.id, { onDelete: 'set null' }), // assigned PM
  // Financial summary (calculated fields for quick access)
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 12, scale: 2 }), // from quote
  actualTotalCost: decimal("actual_total_cost", { precision: 12, scale: 2 }), // accumulated actual costs
  // Project metadata
  customFields: jsonb("custom_fields"), // flexible additional data
  notes: text("notes"), // general project notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_projects_status").on(table.status),
  index("idx_projects_account_id").on(table.accountId),
  index("idx_projects_project_manager_id").on(table.projectManagerId),
  index("idx_projects_estimated_start_date").on(table.estimatedStartDate),
  index("idx_projects_priority_status").on(table.priority, table.status),
]);

// Project milestones - key deliverables and checkpoints
export const projectMilestones = pgTable("project_milestones", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  name: text("name").notNull(), // milestone name
  description: text("description"), // milestone description
  targetDate: timestamp("target_date").notNull(), // planned completion date
  actualDate: timestamp("actual_date"), // actual completion date
  status: milestoneStatusEnum("status").notNull().default("pending"), // pending, in_progress, completed, overdue
  completionPercentage: integer("completion_percentage").default(0), // 0-100
  isClientApprovalRequired: boolean("is_client_approval_required").default(false),
  clientApprovedAt: timestamp("client_approved_at"), // when client approved
  clientApprovedBy: integer("client_approved_by").references(() => contacts.id, { onDelete: 'set null' }),
  displayOrder: integer("display_order").default(0), // for milestone ordering
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_project_milestones_project_id").on(table.projectId),
  index("idx_project_milestones_status").on(table.status),
  index("idx_project_milestones_target_date").on(table.targetDate),
  index("idx_project_milestones_project_display").on(table.projectId, table.displayOrder),
]);

// Hierarchical project tasks with dependency support  
export const projectTasks = pgTable("project_tasks", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  parentTaskId: integer("parent_task_id"), // self-referencing foreign key handled below
  milestoneId: integer("milestone_id").references(() => projectMilestones.id, { onDelete: 'set null' }), // optional milestone link
  taskNumber: text("task_number"), // human-readable task identifier
  title: text("title").notNull(), // task name
  description: text("description"), // detailed task description
  status: taskStatusEnum("status").notNull().default("pending"), // pending, in_progress, completed, blocked, cancelled
  priority: priorityEnum("priority").notNull().default("medium"), // low, medium, high, urgent
  // Scheduling
  estimatedStartDate: timestamp("estimated_start_date"),
  actualStartDate: timestamp("actual_start_date"),
  estimatedEndDate: timestamp("estimated_end_date"),
  actualEndDate: timestamp("actual_end_date"),
  // Resource estimates
  estimatedHours: decimal("estimated_hours", { precision: 8, scale: 2 }), // estimated labor hours
  actualHours: decimal("actual_hours", { precision: 8, scale: 2 }), // actual hours worked
  estimatedCost: decimal("estimated_cost", { precision: 10, scale: 2 }), // estimated total cost
  actualCost: decimal("actual_cost", { precision: 10, scale: 2 }), // actual total cost
  // Assignment and progress
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }), // primary assignee
  completionPercentage: integer("completion_percentage").default(0), // 0-100
  // Task metadata
  taskType: text("task_type"), // installation, inspection, delivery, cleanup, etc.
  requiresClientPresence: boolean("requires_client_presence").default(false),
  requiresPermits: boolean("requires_permits").default(false),
  displayOrder: integer("display_order").default(0), // for task ordering
  customFields: jsonb("custom_fields"), // flexible additional data
  notes: text("notes"), // task-specific notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_project_tasks_project_id").on(table.projectId),
  index("idx_project_tasks_parent_task_id").on(table.parentTaskId),
  index("idx_project_tasks_status").on(table.status),
  index("idx_project_tasks_display_order").on(table.displayOrder),
  index("idx_project_tasks_project_status").on(table.projectId, table.status),
  index("idx_project_tasks_assigned_to").on(table.assignedTo),
  index("idx_project_tasks_estimated_start").on(table.estimatedStartDate),
  index("idx_project_tasks_priority_status").on(table.priority, table.status),
]);

// Task dependencies - defines prerequisite relationships between tasks  
export const projectTaskDependencies = pgTable("project_task_dependencies", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => projectTasks.id, { onDelete: 'cascade' }), // dependent task
  dependsOnTaskId: integer("depends_on_task_id").notNull().references(() => projectTasks.id, { onDelete: 'cascade' }), // prerequisite task
  dependencyType: text("dependency_type").notNull().default("finish_to_start"), // finish_to_start, start_to_start, finish_to_finish, start_to_finish
  lagDays: integer("lag_days").default(0), // delay in days after prerequisite completion
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  unique("unique_task_dependency").on(table.taskId, table.dependsOnTaskId),
  index("idx_task_dependencies_task_id").on(table.taskId),
  index("idx_task_dependencies_depends_on").on(table.dependsOnTaskId),
]);

// Multi-assignment support for tasks - enables multiple crew members per task
export const projectTaskAssignments = pgTable("project_task_assignments", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => projectTasks.id, { onDelete: 'cascade' }),
  crewMemberId: integer("crew_member_id").references(() => projectCrew.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // alternative to crew member
  role: text("role").notNull(), // primary, assistant, specialist, observer
  plannedHours: decimal("planned_hours", { precision: 8, scale: 2 }), // planned hours for this assignment
  actualHours: decimal("actual_hours", { precision: 8, scale: 2 }), // actual hours worked
  plannedStartDate: timestamp("planned_start_date"),
  plannedEndDate: timestamp("planned_end_date"),
  actualStartDate: timestamp("actual_start_date"),
  actualEndDate: timestamp("actual_end_date"),
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }), // override rate for this assignment
  isActive: boolean("is_active").default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_task_assignments_task_id").on(table.taskId),
  index("idx_task_assignments_crew_member_id").on(table.crewMemberId),
  index("idx_task_assignments_user_id").on(table.userId),
  index("idx_task_assignments_planned_start").on(table.plannedStartDate),
  unique("unique_task_crew_assignment").on(table.taskId, table.crewMemberId),
  unique("unique_task_user_assignment").on(table.taskId, table.userId),
  check("crew_or_user_not_both", sql`(crew_member_id IS NULL AND user_id IS NOT NULL) OR (crew_member_id IS NOT NULL AND user_id IS NULL)`),
]);

// Resource scheduling events for comprehensive project planning
export const projectScheduleEvents = pgTable("project_schedule_events", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: 'set null' }), // optional task link
  resourceType: resourceTypeEnum("resource_type").notNull(), // crew_member, equipment, vehicle, external_contractor
  resourceId: integer("resource_id").notNull(), // points to crew, equipment, etc based on resourceType
  title: text("title").notNull(), // event title/description
  startDateTime: timestamp("start_date_time").notNull(),
  endDateTime: timestamp("end_date_time").notNull(),
  status: scheduleEventStatusEnum("status").notNull().default("scheduled"),
  isAllDay: boolean("is_all_day").default(false),
  location: text("location"), // work location for this event
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_schedule_events_project_id").on(table.projectId),
  index("idx_schedule_events_start_end").on(table.startDateTime, table.endDateTime),
  index("idx_schedule_events_resource").on(table.resourceType, table.resourceId),
  index("idx_schedule_events_resource_start_end").on(table.resourceType, table.resourceId, table.startDateTime, table.endDateTime),
  index("idx_schedule_events_status").on(table.status),
]);

// Project budget lines for detailed cost tracking
export const projectBudgetLines = pgTable("project_budget_lines", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  costCode: text("cost_code").notNull(), // standardized cost codes (labor, materials, equipment, etc.)
  description: text("description").notNull(),
  category: text("category").notNull(), // labor, materials, equipment, permits, overhead, etc.
  quantity: decimal("quantity", { precision: 10, scale: 2 }).notNull(),
  unit: text("unit").notNull().default("each"), // hours, sqft, linear ft, etc.
  estimatedUnitCost: decimal("estimated_unit_cost", { precision: 10, scale: 2 }).notNull(),
  estimatedTotalCost: decimal("estimated_total_cost", { precision: 12, scale: 2 }).notNull(),
  actualQuantity: decimal("actual_quantity", { precision: 10, scale: 2 }).default("0"),
  actualUnitCost: decimal("actual_unit_cost", { precision: 10, scale: 2 }).default("0"),
  actualTotalCost: decimal("actual_total_cost", { precision: 12, scale: 2 }).default("0"),
  linkedLineItemId: integer("linked_line_item_id").references(() => lineItems.id, { onDelete: 'set null' }), // link to original quote line item
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_budget_lines_project_id").on(table.projectId),
  index("idx_budget_lines_cost_code").on(table.costCode),
  index("idx_budget_lines_category").on(table.category),
  index("idx_budget_lines_linked_line_item").on(table.linkedLineItemId),
]);

// Purchase orders for material procurement tracking
export const projectPurchaseOrders = pgTable("project_purchase_orders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  poNumber: text("po_number").notNull().unique(),
  supplierName: text("supplier_name").notNull(),
  supplierContact: text("supplier_contact"),
  supplierPhone: text("supplier_phone"),
  supplierEmail: text("supplier_email"),
  orderDate: timestamp("order_date").notNull(),
  expectedDeliveryDate: timestamp("expected_delivery_date"),
  actualDeliveryDate: timestamp("actual_delivery_date"),
  status: text("status").notNull().default("pending"), // pending, ordered, partially_received, received, cancelled
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0"),
  notes: text("notes"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_purchase_orders_project_id").on(table.projectId),
  index("idx_purchase_orders_status").on(table.status),
  index("idx_purchase_orders_order_date").on(table.orderDate),
  index("idx_purchase_orders_expected_delivery").on(table.expectedDeliveryDate),
]);

// Material receipts for tracking delivered items
export const projectMaterialReceipts = pgTable("project_material_receipts", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  purchaseOrderId: integer("purchase_order_id").references(() => projectPurchaseOrders.id, { onDelete: 'set null' }),
  materialId: integer("material_id").references(() => projectMaterials.id, { onDelete: 'set null' }),
  receiptNumber: text("receipt_number").notNull(),
  deliveryDate: timestamp("delivery_date").notNull(),
  quantityOrdered: decimal("quantity_ordered", { precision: 10, scale: 2 }).notNull(),
  quantityReceived: decimal("quantity_received", { precision: 10, scale: 2 }).notNull(),
  quantityAccepted: decimal("quantity_accepted", { precision: 10, scale: 2 }).notNull(),
  quantityRejected: decimal("quantity_rejected", { precision: 10, scale: 2 }).default("0"),
  rejectionReason: text("rejection_reason"),
  condition: text("condition").notNull().default("good"), // good, damaged, defective
  receivedBy: varchar("received_by").references(() => users.id, { onDelete: 'set null' }),
  inspectedBy: varchar("inspected_by").references(() => users.id, { onDelete: 'set null' }),
  storageLocation: text("storage_location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_material_receipts_project_id").on(table.projectId),
  index("idx_material_receipts_purchase_order_id").on(table.purchaseOrderId),
  index("idx_material_receipts_delivery_date").on(table.deliveryDate),
  index("idx_material_receipts_material_id").on(table.materialId),
]);

// Quote-to-project line item mapping for conversion tracking
export const projectLineItemLinks = pgTable("project_line_item_links", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  lineItemId: integer("line_item_id").notNull().references(() => lineItems.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: 'set null' }), // which task this line item relates to
  budgetLineId: integer("budget_line_id").references(() => projectBudgetLines.id, { onDelete: 'set null' }), // which budget line this maps to
  conversionNotes: text("conversion_notes"), // notes about any changes during conversion
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_line_item_links_project_id").on(table.projectId),
  index("idx_line_item_links_line_item_id").on(table.lineItemId),
  index("idx_line_item_links_task_id").on(table.taskId),
  index("idx_line_item_links_budget_line_id").on(table.budgetLineId),
  unique("unique_project_line_item_link").on(table.projectId, table.lineItemId),
]);

// Project crew and resource management
export const projectCrew = pgTable("project_crew", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }), // internal crew member
  externalContractorName: text("external_contractor_name"), // external contractor if not a user
  role: text("role").notNull(), // project_manager, foreman, installer, helper, specialist, contractor
  skillSet: jsonb("skill_set"), // array of skills/certifications
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }), // labor rate for this project
  // Availability
  startDate: timestamp("start_date"), // when available to start
  endDate: timestamp("end_date"), // when availability ends
  isActive: boolean("is_active").default(true), // currently assigned to project
  // Contact info for external contractors
  phone: text("phone"),
  email: text("email"),
  company: text("company"),
  notes: text("notes"), // crew member specific notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Equipment and tool allocation to projects
export const projectEquipment = pgTable("project_equipment", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  equipmentName: text("equipment_name").notNull(), // tool/equipment name
  equipmentType: text("equipment_type"), // vehicle, power_tool, specialty_equipment, safety_equipment
  description: text("description"), // equipment description
  serialNumber: text("serial_number"), // asset tracking
  // Scheduling
  allocatedDate: timestamp("allocated_date").notNull(), // when allocated to project
  returnDate: timestamp("return_date"), // when returned/deallocated
  // Costs
  dailyRate: decimal("daily_rate", { precision: 8, scale: 2 }), // daily rental/usage cost
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }), // total cost for this allocation
  // Equipment status
  status: text("status").notNull().default("allocated"), // allocated, in_use, returned, maintenance
  condition: text("condition"), // good, fair, needs_repair, broken
  assignedTo: varchar("assigned_to").references(() => users.id, { onDelete: 'set null' }), // responsible crew member
  notes: text("notes"), // equipment specific notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project progress documentation and photo tracking
export const projectProgress = pgTable("project_progress", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: 'set null' }), // optional task link
  milestoneId: integer("milestone_id").references(() => projectMilestones.id, { onDelete: 'set null' }), // optional milestone link
  entryType: text("entry_type").notNull(), // daily_note, photo_update, milestone_update, client_communication, issue_report
  title: text("title").notNull(), // progress entry title
  description: text("description").notNull(), // detailed progress description
  // Progress photos and documentation
  photos: jsonb("photos"), // array of photo metadata objects
  documents: jsonb("documents"), // array of document metadata objects
  // Weather and conditions
  weatherConditions: text("weather_conditions"), // weather impact on work
  workConditions: text("work_conditions"), // site conditions affecting progress
  // Team and hours
  crewPresent: jsonb("crew_present"), // array of crew member IDs present
  hoursWorked: decimal("hours_worked", { precision: 6, scale: 2 }), // total hours for this entry
  // Quality and safety
  qualityIssues: text("quality_issues"), // any quality concerns noted
  safetyIncidents: text("safety_incidents"), // safety incidents or near misses
  // Client interaction
  clientPresent: boolean("client_present").default(false), // was client on site
  clientFeedback: text("client_feedback"), // client comments or feedback
  // Entry metadata
  entryDate: timestamp("entry_date").notNull(), // date of this progress entry
  createdBy: varchar("created_by").references(() => users.id, { onDelete: 'set null' }), // who created the entry
  isVisible: boolean("is_visible").default(true), // visible to client in portal
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Time tracking for project tasks and crew
export const projectTimeEntries = pgTable("project_time_entries", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: 'set null' }), // optional task link
  crewMemberId: integer("crew_member_id").references(() => projectCrew.id, { onDelete: 'set null' }), // crew member
  userId: varchar("user_id").references(() => users.id, { onDelete: 'set null' }), // alternative user reference
  // Time tracking
  workDate: timestamp("work_date").notNull(), // date of work
  startTime: timestamp("start_time"), // work start time
  endTime: timestamp("end_time"), // work end time
  hoursWorked: decimal("hours_worked", { precision: 6, scale: 2 }).notNull(), // total hours
  breakHours: decimal("break_hours", { precision: 6, scale: 2 }).default("0"), // unpaid break time
  // Rate and costs
  hourlyRate: decimal("hourly_rate", { precision: 8, scale: 2 }), // rate for this entry
  laborCost: decimal("labor_cost", { precision: 10, scale: 2 }), // calculated labor cost
  overtimeHours: decimal("overtime_hours", { precision: 6, scale: 2 }).default("0"), // overtime hours
  overtimeRate: decimal("overtime_rate", { precision: 8, scale: 2 }), // overtime hourly rate
  // Work description
  workDescription: text("work_description").notNull(), // what work was performed
  workType: text("work_type"), // installation, prep, cleanup, travel, meetings
  // Approval status
  status: text("status").notNull().default("pending"), // pending, approved, rejected
  approvedBy: varchar("approved_by").references(() => users.id, { onDelete: 'set null' }),
  approvedAt: timestamp("approved_at"),
  // Entry metadata
  enteredBy: varchar("entered_by").references(() => users.id, { onDelete: 'set null' }), // who entered the time
  notes: text("notes"), // additional notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Material usage and inventory tracking for projects
export const projectMaterials = pgTable("project_materials", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  taskId: integer("task_id").references(() => projectTasks.id, { onDelete: 'set null' }), // optional task link
  productId: integer("product_id").references(() => products.id, { onDelete: 'set null' }), // reference to product catalog
  materialName: text("material_name").notNull(), // material/product name
  materialType: text("material_type"), // product, hardware, consumable, equipment_rental
  // Quantities
  quantityOrdered: decimal("quantity_ordered", { precision: 10, scale: 2 }), // originally ordered quantity
  quantityDelivered: decimal("quantity_delivered", { precision: 10, scale: 2 }), // delivered quantity
  quantityUsed: decimal("quantity_used", { precision: 10, scale: 2 }), // actually used quantity
  quantityReturned: decimal("quantity_returned", { precision: 10, scale: 2 }).default("0"), // returned to supplier
  quantityWasted: decimal("quantity_wasted", { precision: 10, scale: 2 }).default("0"), // damaged/wasted quantity
  unit: text("unit").default("each"), // each, sq ft, linear ft, cubic yard, etc.
  // Costs
  unitCost: decimal("unit_cost", { precision: 10, scale: 2 }), // cost per unit
  totalCost: decimal("total_cost", { precision: 12, scale: 2 }), // total cost for this material
  // Delivery and usage tracking
  orderDate: timestamp("order_date"), // when material was ordered
  expectedDeliveryDate: timestamp("expected_delivery_date"), // expected delivery
  actualDeliveryDate: timestamp("actual_delivery_date"), // actual delivery date
  usageDate: timestamp("usage_date"), // when material was used
  // Supplier information
  supplierName: text("supplier_name"), // supplier/vendor name
  supplierOrderNumber: text("supplier_order_number"), // supplier's order reference
  invoiceNumber: text("invoice_number"), // supplier invoice number
  // Material metadata
  description: text("description"), // detailed material description
  specifications: text("specifications"), // technical specifications
  lotNumber: text("lot_number"), // lot/batch number for tracking
  warrantyPeriod: text("warranty_period"), // warranty information
  notes: text("notes"), // material-specific notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Change orders and scope modifications
export const projectChangeOrders = pgTable("project_change_orders", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  changeOrderNumber: text("change_order_number").notNull().unique(), // unique CO identifier
  title: text("title").notNull(), // change order title
  description: text("description").notNull(), // detailed description of changes
  reason: text("reason"), // reason for change (client_request, unforeseen_conditions, code_requirement, etc.)
  // Financial impact
  laborCostChange: decimal("labor_cost_change", { precision: 12, scale: 2 }).default("0"), // labor cost impact
  materialCostChange: decimal("material_cost_change", { precision: 12, scale: 2 }).default("0"), // material cost impact
  equipmentCostChange: decimal("equipment_cost_change", { precision: 12, scale: 2 }).default("0"), // equipment cost impact
  totalCostChange: decimal("total_cost_change", { precision: 12, scale: 2 }).notNull(), // total cost impact
  // Schedule impact
  scheduleImpactDays: integer("schedule_impact_days").default(0), // days added/removed from schedule
  // Approval workflow
  status: changeOrderStatusEnum("status").notNull().default("draft"), // draft, pending_approval, approved, rejected, implemented
  requestedBy: varchar("requested_by").references(() => users.id, { onDelete: 'set null' }), // who requested the change
  requestDate: timestamp("request_date").defaultNow(), // when change was requested
  // Client approval
  clientApprovalRequired: boolean("client_approval_required").default(true),
  clientApprovedBy: integer("client_approved_by").references(() => contacts.id, { onDelete: 'set null' }),
  clientApprovedAt: timestamp("client_approved_at"),
  clientSignature: text("client_signature"), // client signature (name)
  // Internal approval
  internalApprovedBy: varchar("internal_approved_by").references(() => users.id, { onDelete: 'set null' }),
  internalApprovedAt: timestamp("internal_approved_at"),
  // Implementation
  implementedBy: varchar("implemented_by").references(() => users.id, { onDelete: 'set null' }),
  implementedAt: timestamp("implemented_at"),
  // Change order metadata
  attachments: jsonb("attachments"), // supporting documents and images
  impactedTasks: jsonb("impacted_tasks"), // array of task IDs affected by this change
  notes: text("notes"), // additional notes
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Project financial summaries and cost tracking
export const projectFinancials = pgTable("project_financials", {
  id: serial("id").primaryKey(),
  projectId: integer("project_id").notNull().references(() => projects.id, { onDelete: 'cascade' }),
  // Original estimates (from quote)
  originalEstimatedLabor: decimal("original_estimated_labor", { precision: 12, scale: 2 }).default("0"),
  originalEstimatedMaterials: decimal("original_estimated_materials", { precision: 12, scale: 2 }).default("0"),
  originalEstimatedEquipment: decimal("original_estimated_equipment", { precision: 12, scale: 2 }).default("0"),
  originalEstimatedTotal: decimal("original_estimated_total", { precision: 12, scale: 2 }).default("0"),
  // Current estimates (including approved change orders)
  currentEstimatedLabor: decimal("current_estimated_labor", { precision: 12, scale: 2 }).default("0"),
  currentEstimatedMaterials: decimal("current_estimated_materials", { precision: 12, scale: 2 }).default("0"),
  currentEstimatedEquipment: decimal("current_estimated_equipment", { precision: 12, scale: 2 }).default("0"),
  currentEstimatedTotal: decimal("current_estimated_total", { precision: 12, scale: 2 }).default("0"),
  // Actual costs to date
  actualLaborCost: decimal("actual_labor_cost", { precision: 12, scale: 2 }).default("0"),
  actualMaterialCost: decimal("actual_material_cost", { precision: 12, scale: 2 }).default("0"),
  actualEquipmentCost: decimal("actual_equipment_cost", { precision: 12, scale: 2 }).default("0"),
  actualTotalCost: decimal("actual_total_cost", { precision: 12, scale: 2 }).default("0"),
  // Change order impacts
  totalChangeOrderValue: decimal("total_change_order_value", { precision: 12, scale: 2 }).default("0"),
  approvedChangeOrderValue: decimal("approved_change_order_value", { precision: 12, scale: 2 }).default("0"),
  // Billing and revenue
  totalBilledAmount: decimal("total_billed_amount", { precision: 12, scale: 2 }).default("0"),
  totalPaidAmount: decimal("total_paid_amount", { precision: 12, scale: 2 }).default("0"),
  retainageAmount: decimal("retainage_amount", { precision: 12, scale: 2 }).default("0"),
  // Profitability analysis
  grossProfit: decimal("gross_profit", { precision: 12, scale: 2 }), // revenue - direct costs
  grossMarginPercentage: decimal("gross_margin_percentage", { precision: 5, scale: 2 }), // (gross profit / revenue) * 100
  costVariance: decimal("cost_variance", { precision: 12, scale: 2 }), // actual vs estimated costs
  costVariancePercentage: decimal("cost_variance_percentage", { precision: 5, scale: 2 }), // variance as percentage
  // Summary timestamps
  lastUpdated: timestamp("last_updated").defaultNow(), // when financials were last calculated
  calculatedBy: varchar("calculated_by").references(() => users.id, { onDelete: 'set null' }), // who updated the calculations
  notes: text("notes"), // financial notes and explanations
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  unique("unique_project_financial").on(table.projectId), // one financial record per project
]);



export const insertCustomerSchema = createInsertSchema(customers).omit({
  id: true,
});

// Zod schemas for image metadata structures
export const imageMetadataSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  filename: z.string().min(1, "Filename is required"),
  caption: z.string().optional(),
  altText: z.string().optional(),
  uploadedAt: z.string(),
  size: z.number().optional(),
  thumbnailUrl: z.string().url().optional(),
});

export const projectImageSchema = imageMetadataSchema.extend({
  category: z.enum(['before', 'during', 'after', 'other']),
});

export const portfolioImageSchema = imageMetadataSchema.extend({
  projectType: z.string().optional(),
  featured: z.boolean().optional(),
});

export const technicalDiagramSchema = imageMetadataSchema.extend({
  diagramType: z.enum(['floorplan', 'elevation', 'detail', 'specification', 'other']),
});

export const companyImageSchema = imageMetadataSchema.extend({
  imageType: z.enum(['logo', 'team', 'facility', 'certification', 'other']),
});

export const productImageSchema = imageMetadataSchema.extend({
  imageType: z.enum(['primary', 'gallery', 'specification']),
  displayOrder: z.number().optional(),
});

export const insertQuoteSchema = createInsertSchema(quotes).omit({
  id: true,
  createdAt: true,
}).extend({
  taxRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  discount: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  shipping: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? "0" : (typeof val === 'string' ? val : val.toString())),
  projectName: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  projectAddress: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  estimatedStartDate: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  notes: z.union([z.string(), z.null()]).transform(val => val === null ? "" : val),
  // Image fields
  projectImages: z.array(projectImageSchema).optional(),
  portfolioImages: z.array(portfolioImageSchema).optional(),
  technicalDiagrams: z.array(technicalDiagramSchema).optional(),
  companyImages: z.array(companyImageSchema).optional(),
});

export const insertProductSchema = createInsertSchema(products).omit({
  id: true,
  createdAt: true,
}).extend({
  defaultUnitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  defaultMarkupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  defaultDiscountValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  minLength: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  maxLength: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  minWidth: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  maxWidth: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  // Image fields
  primaryImage: z.string().url().optional(),
  galleryImages: z.array(productImageSchema).optional(),
  specificationSheets: z.array(productImageSchema).optional(),
});

export const insertPricingTableSchema = createInsertSchema(pricingTables).omit({
  id: true,
  createdAt: true,
}).extend({
  lengthMin: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  lengthMax: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  widthMin: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  widthMax: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  retailPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  basePrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export const insertProductAccessorySchema = createInsertSchema(productAccessories).omit({
  id: true,
  createdAt: true,
});

export const insertLineItemSchema = createInsertSchema(lineItems).omit({
  id: true,
}).extend({
  quantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  retailPrice: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  unitPrice: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  markupValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  discountValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
});

export const insertContractTemplateSchema = createInsertSchema(contractTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProposalTemplateSchema = createInsertSchema(proposalTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  category: z.enum(['basic_quote', 'full_proposal', 'executive_summary', 'technical_spec'], {
    errorMap: () => ({ message: "Category must be one of: basic_quote, full_proposal, executive_summary, technical_spec" }),
  }),
  templateType: z.enum(['pdf', 'html', 'email'], {
    errorMap: () => ({ message: "Template type must be one of: pdf, html, email" }),
  }).default('pdf'),
});

// Comprehensive CRM insert schemas
export const insertAccountSchema = createInsertSchema(accounts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  name: z.string().min(1, "Account name is required"),
  type: z.enum(['company', 'individual'], {
    errorMap: () => ({ message: "Account type must be either 'company' or 'individual'" }),
  }),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  billingAddress: z.string().optional(),
  shippingAddress: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export const insertAccountRoleSchema = createInsertSchema(accountRoles).omit({
  id: true,
  createdAt: true,
}).extend({
  accountId: z.number().int().positive("Account ID is required"),
  role: z.enum(['lead', 'client', 'vendor', 'contractor', 'supplier'], {
    errorMap: () => ({ message: "Role must be one of: lead, client, vendor, contractor, supplier" }),
  }),
});

export const insertContactSchema = createInsertSchema(contacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  accountId: z.number().int().positive("Account ID is required"),
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  title: z.string().optional(),
});

export const insertContactRoleSchema = createInsertSchema(contactRoles).omit({
  id: true,
  createdAt: true,
}).extend({
  contactId: z.number().int().positive("Contact ID is required"),
  role: z.enum(['lead', 'client', 'vendor', 'contractor', 'supplier'], {
    errorMap: () => ({ message: "Role must be one of: lead, client, vendor, contractor, supplier" }),
  }),
});

export const insertOpportunitySchema = createInsertSchema(opportunities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  accountId: z.number().int().positive("Account ID is required"),
  primaryContactId: z.number().int().positive().optional(),
  name: z.string().min(1, "Opportunity name is required"),
  stage: z.enum(['inquiry', 'estimating', 'proposal_sent', 'contract_signed', 'project_complete', 'closed_lost'], {
    errorMap: () => ({ message: "Stage must be one of: inquiry, estimating, proposal_sent, contract_signed, project_complete, closed_lost" }),
  }).default('inquiry'),
  amount: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  expectedCloseDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  source: z.string().optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

export const insertActivitySchema = createInsertSchema(activities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  entityType: z.enum(['account', 'contact', 'opportunity'], {
    errorMap: () => ({ message: "Entity type must be one of: account, contact, opportunity" }),
  }),
  entityId: z.number().int().positive("Entity ID is required"),
  type: z.enum(['call', 'email', 'meeting', 'task', 'note', 'quote_sent', 'proposal_sent', 'contract_signed'], {
    errorMap: () => ({ message: "Type must be one of: call, email, meeting, task, note, quote_sent, proposal_sent, contract_signed" }),
  }),
  summary: z.string().min(1, "Activity summary is required"),
  description: z.string().optional(),
  dueAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  completedAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  assignedTo: z.string().optional(),
});

// CRM insert schemas (existing - keeping for backward compatibility)
export const insertLeadSchema = createInsertSchema(leads).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  status: z.enum(['new', 'contacted', 'quoted', 'won', 'lost'], {
    errorMap: () => ({ message: "Status must be one of: new, contacted, quoted, won, lost" }),
  }).default('new'),
  value: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  name: z.string().min(1, "Lead name is required"),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  company: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  customerId: z.number().int().positive().optional(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({
  id: true,
  createdAt: true,
  completedAt: true,
}).extend({
  leadId: z.number().int().positive("Lead ID is required"),
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  dueDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  completed: z.boolean().default(false),
  priority: z.enum(['low', 'medium', 'high'], {
    errorMap: () => ({ message: "Priority must be one of: low, medium, high" }),
  }).default('medium'),
  assignedTo: z.string().optional(),
});

export const insertLeadActivitySchema = createInsertSchema(leadActivities).omit({
  id: true,
  createdAt: true,
}).extend({
  leadId: z.number().int().positive("Lead ID is required"),
  activityType: z.enum(['status_change', 'task_completed', 'note_added', 'email_sent', 'call_made', 'meeting_scheduled', 'quote_sent', 'customer_converted', 'other'], {
    errorMap: () => ({ message: "Activity type must be one of: status_change, task_completed, note_added, email_sent, call_made, meeting_scheduled, quote_sent, customer_converted, other" }),
  }),
  description: z.string().min(1, "Activity description is required"),
  userId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Project Management insert schemas
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  quoteId: z.number().int().positive("Quote ID is required"),
  opportunityId: z.number().int().positive().optional(),
  accountId: z.number().int().positive("Account ID is required"),
  primaryContactId: z.number().int().positive().optional(),
  projectNumber: z.string().min(1, "Project number is required"),
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  status: z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'billed', 'cancelled'], {
    errorMap: () => ({ message: "Status must be one of: planning, in_progress, on_hold, completed, billed, cancelled" }),
  }).default('planning'),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], {
    errorMap: () => ({ message: "Priority must be one of: low, medium, high, urgent" }),
  }).default('medium'),
  projectAddress: z.string().optional(),
  estimatedStartDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualStartDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  estimatedEndDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualEndDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  projectManagerId: z.string().optional(),
  estimatedTotalCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  actualTotalCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  customFields: z.record(z.any()).optional(),
  notes: z.string().optional(),
});

export const insertProjectMilestoneSchema = createInsertSchema(projectMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  name: z.string().min(1, "Milestone name is required"),
  description: z.string().optional(),
  targetDate: z.union([z.date(), z.string()]).transform(val => val),
  actualDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'overdue'], {
    errorMap: () => ({ message: "Status must be one of: pending, in_progress, completed, overdue" }),
  }).default('pending'),
  completionPercentage: z.number().int().min(0).max(100).default(0),
  isClientApprovalRequired: z.boolean().default(false),
  clientApprovedAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  clientApprovedBy: z.number().int().positive().optional(),
  displayOrder: z.number().int().default(0),
});

export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  parentTaskId: z.number().int().positive().optional(),
  milestoneId: z.number().int().positive().optional(),
  taskNumber: z.string().optional(),
  title: z.string().min(1, "Task title is required"),
  description: z.string().optional(),
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked', 'cancelled'], {
    errorMap: () => ({ message: "Status must be one of: pending, in_progress, completed, blocked, cancelled" }),
  }).default('pending'),
  priority: z.enum(['low', 'medium', 'high', 'urgent'], {
    errorMap: () => ({ message: "Priority must be one of: low, medium, high, urgent" }),
  }).default('medium'),
  estimatedStartDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualStartDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  estimatedEndDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualEndDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  estimatedHours: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  actualHours: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  estimatedCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  actualCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  assignedTo: z.string().optional(),
  completionPercentage: z.number().int().min(0).max(100).default(0),
  taskType: z.string().optional(),
  requiresClientPresence: z.boolean().default(false),
  requiresPermits: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  customFields: z.record(z.any()).optional(),
  notes: z.string().optional(),
});

export const insertProjectTaskDependencySchema = createInsertSchema(projectTaskDependencies).omit({
  id: true,
  createdAt: true,
}).extend({
  taskId: z.number().int().positive("Task ID is required"),
  dependsOnTaskId: z.number().int().positive("Dependent task ID is required"),
  dependencyType: z.enum(['finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'], {
    errorMap: () => ({ message: "Dependency type must be one of: finish_to_start, start_to_start, finish_to_finish, start_to_finish" }),
  }).default('finish_to_start'),
  lagDays: z.number().int().default(0),
});

export const insertProjectCrewSchema = createInsertSchema(projectCrew).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  userId: z.string().optional(),
  externalContractorName: z.string().optional(),
  role: z.enum(['project_manager', 'foreman', 'installer', 'helper', 'specialist', 'contractor'], {
    errorMap: () => ({ message: "Role must be one of: project_manager, foreman, installer, helper, specialist, contractor" }),
  }),
  skillSet: z.array(z.string()).optional(),
  hourlyRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  startDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  endDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  isActive: z.boolean().default(true),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().optional(),
  notes: z.string().optional(),
});

export const insertProjectEquipmentSchema = createInsertSchema(projectEquipment).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  equipmentName: z.string().min(1, "Equipment name is required"),
  equipmentType: z.enum(['vehicle', 'power_tool', 'specialty_equipment', 'safety_equipment'], {
    errorMap: () => ({ message: "Equipment type must be one of: vehicle, power_tool, specialty_equipment, safety_equipment" }),
  }).optional(),
  description: z.string().optional(),
  serialNumber: z.string().optional(),
  allocatedDate: z.union([z.date(), z.string()]).transform(val => val),
  returnDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  dailyRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  totalCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  status: z.enum(['allocated', 'in_use', 'returned', 'maintenance'], {
    errorMap: () => ({ message: "Status must be one of: allocated, in_use, returned, maintenance" }),
  }).default('allocated'),
  condition: z.enum(['good', 'fair', 'needs_repair', 'broken'], {
    errorMap: () => ({ message: "Condition must be one of: good, fair, needs_repair, broken" }),
  }).optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
});

// Zod schemas for project progress photo metadata
export const progressPhotoSchema = imageMetadataSchema.extend({
  photoType: z.enum(['daily_progress', 'milestone_completion', 'issue_documentation', 'quality_check', 'safety_incident', 'client_walkthrough']),
  gpsLocation: z.object({
    latitude: z.number(),
    longitude: z.number(),
  }).optional(),
  weatherConditions: z.string().optional(),
  relatedTaskId: z.number().int().positive().optional(),
  relatedMilestoneId: z.number().int().positive().optional(),
});

export const progressDocumentSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  filename: z.string().min(1, "Filename is required"),
  documentType: z.enum(['permit', 'inspection_report', 'change_order', 'material_delivery', 'safety_report', 'client_approval', 'invoice', 'other']),
  description: z.string().optional(),
  uploadedAt: z.string(),
  size: z.number().optional(),
  relatedTaskId: z.number().int().positive().optional(),
  relatedMilestoneId: z.number().int().positive().optional(),
});

export const insertProjectProgressSchema = createInsertSchema(projectProgress).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  taskId: z.number().int().positive().optional(),
  milestoneId: z.number().int().positive().optional(),
  entryType: z.enum(['daily_note', 'photo_update', 'milestone_update', 'client_communication', 'issue_report'], {
    errorMap: () => ({ message: "Entry type must be one of: daily_note, photo_update, milestone_update, client_communication, issue_report" }),
  }),
  title: z.string().min(1, "Progress entry title is required"),
  description: z.string().min(1, "Progress description is required"),
  photos: z.array(progressPhotoSchema).optional(),
  documents: z.array(progressDocumentSchema).optional(),
  weatherConditions: z.string().optional(),
  workConditions: z.string().optional(),
  crewPresent: z.array(z.number().int()).optional(),
  hoursWorked: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  qualityIssues: z.string().optional(),
  safetyIncidents: z.string().optional(),
  clientPresent: z.boolean().default(false),
  clientFeedback: z.string().optional(),
  entryDate: z.union([z.date(), z.string()]).transform(val => val),
  createdBy: z.string().optional(),
  isVisible: z.boolean().default(true),
});

export const insertProjectTimeEntrySchema = createInsertSchema(projectTimeEntries).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  taskId: z.number().int().positive().optional(),
  crewMemberId: z.number().int().positive().optional(),
  userId: z.string().optional(),
  workDate: z.union([z.date(), z.string()]).transform(val => val),
  startTime: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  endTime: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  hoursWorked: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  breakHours: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  hourlyRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  laborCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  overtimeHours: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  overtimeRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  workDescription: z.string().min(1, "Work description is required"),
  workType: z.enum(['installation', 'prep', 'cleanup', 'travel', 'meetings', 'inspection', 'delivery', 'other'], {
    errorMap: () => ({ message: "Work type must be one of: installation, prep, cleanup, travel, meetings, inspection, delivery, other" }),
  }).optional(),
  status: z.enum(['pending', 'approved', 'rejected'], {
    errorMap: () => ({ message: "Status must be one of: pending, approved, rejected" }),
  }).default('pending'),
  approvedBy: z.string().optional(),
  approvedAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  enteredBy: z.string().optional(),
  notes: z.string().optional(),
});

export const insertProjectMaterialSchema = createInsertSchema(projectMaterials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  taskId: z.number().int().positive().optional(),
  productId: z.number().int().positive().optional(),
  materialName: z.string().min(1, "Material name is required"),
  materialType: z.enum(['product', 'hardware', 'consumable', 'equipment_rental'], {
    errorMap: () => ({ message: "Material type must be one of: product, hardware, consumable, equipment_rental" }),
  }).optional(),
  quantityOrdered: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  quantityDelivered: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  quantityUsed: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  quantityReturned: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  quantityWasted: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  unit: z.string().default("each"),
  unitCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  totalCost: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  orderDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  expectedDeliveryDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualDeliveryDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  usageDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  supplierName: z.string().optional(),
  supplierOrderNumber: z.string().optional(),
  invoiceNumber: z.string().optional(),
  description: z.string().optional(),
  specifications: z.string().optional(),
  lotNumber: z.string().optional(),
  warrantyPeriod: z.string().optional(),
  notes: z.string().optional(),
});

export const insertProjectChangeOrderSchema = createInsertSchema(projectChangeOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  changeOrderNumber: z.string().min(1, "Change order number is required"),
  title: z.string().min(1, "Change order title is required"),
  description: z.string().min(1, "Change order description is required"),
  reason: z.enum(['client_request', 'unforeseen_conditions', 'code_requirement', 'design_change', 'material_unavailable', 'safety_requirement', 'other'], {
    errorMap: () => ({ message: "Reason must be one of: client_request, unforeseen_conditions, code_requirement, design_change, material_unavailable, safety_requirement, other" }),
  }).optional(),
  laborCostChange: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  materialCostChange: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  equipmentCostChange: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  totalCostChange: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  scheduleImpactDays: z.number().int().default(0),
  status: z.enum(['draft', 'pending_approval', 'approved', 'rejected', 'implemented'], {
    errorMap: () => ({ message: "Status must be one of: draft, pending_approval, approved, rejected, implemented" }),
  }).default('draft'),
  requestedBy: z.string().optional(),
  requestDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  clientApprovalRequired: z.boolean().default(true),
  clientApprovedBy: z.number().int().positive().optional(),
  clientApprovedAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  clientSignature: z.string().optional(),
  internalApprovedBy: z.string().optional(),
  internalApprovedAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  implementedBy: z.string().optional(),
  implementedAt: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  attachments: z.array(progressDocumentSchema).optional(),
  impactedTasks: z.array(z.number().int()).optional(),
  notes: z.string().optional(),
});

export const insertProjectFinancialSchema = createInsertSchema(projectFinancials).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  originalEstimatedLabor: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  originalEstimatedMaterials: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  originalEstimatedEquipment: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  originalEstimatedTotal: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  currentEstimatedLabor: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  currentEstimatedMaterials: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  currentEstimatedEquipment: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  currentEstimatedTotal: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  actualLaborCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  actualMaterialCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  actualEquipmentCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  actualTotalCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  totalChangeOrderValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  approvedChangeOrderValue: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  totalBilledAmount: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  totalPaidAmount: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  retainageAmount: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  grossProfit: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  grossMarginPercentage: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  costVariance: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  costVariancePercentage: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  lastUpdated: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  calculatedBy: z.string().optional(),
  notes: z.string().optional(),
});

// Zod schemas for new tables
export const insertProjectTaskAssignmentSchema = createInsertSchema(projectTaskAssignments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  taskId: z.number().int().positive("Task ID is required"),
  crewMemberId: z.number().int().positive().optional(),
  userId: z.string().optional(),
  role: z.enum(['primary', 'assistant', 'specialist', 'observer']),
  plannedHours: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  actualHours: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  plannedStartDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  plannedEndDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualStartDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualEndDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  hourlyRate: z.union([z.string(), z.number(), z.null()]).transform(val => val === null ? null : (typeof val === 'string' ? val : val.toString())).optional(),
  isActive: z.boolean().default(true),
  notes: z.string().optional(),
});

export const insertProjectScheduleEventSchema = createInsertSchema(projectScheduleEvents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  taskId: z.number().int().positive().optional(),
  resourceType: z.enum(['crew_member', 'equipment', 'vehicle', 'external_contractor']),
  resourceId: z.number().int().positive("Resource ID is required"),
  title: z.string().min(1, "Event title is required"),
  startDateTime: z.union([z.date(), z.string()]).transform(val => val),
  endDateTime: z.union([z.date(), z.string()]).transform(val => val),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'rescheduled']).default('scheduled'),
  isAllDay: z.boolean().default(false),
  location: z.string().optional(),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

export const insertProjectBudgetLineSchema = createInsertSchema(projectBudgetLines).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  costCode: z.string().min(1, "Cost code is required"),
  description: z.string().min(1, "Description is required"),
  category: z.enum(['labor', 'materials', 'equipment', 'permits', 'overhead', 'other']),
  quantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  unit: z.string().default("each"),
  estimatedUnitCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  estimatedTotalCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  actualQuantity: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  actualUnitCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  actualTotalCost: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  linkedLineItemId: z.number().int().positive().optional(),
});

export const insertProjectPurchaseOrderSchema = createInsertSchema(projectPurchaseOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  poNumber: z.string().min(1, "PO number is required"),
  supplierName: z.string().min(1, "Supplier name is required"),
  supplierContact: z.string().optional(),
  supplierPhone: z.string().optional(),
  supplierEmail: z.string().email().optional().or(z.literal('')),
  orderDate: z.union([z.date(), z.string()]).transform(val => val),
  expectedDeliveryDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  actualDeliveryDate: z.union([z.date(), z.string(), z.null()]).transform(val => val === null ? null : val).optional(),
  status: z.enum(['pending', 'ordered', 'partially_received', 'received', 'cancelled']).default('pending'),
  totalAmount: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  paidAmount: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  notes: z.string().optional(),
  createdBy: z.string().optional(),
});

export const insertProjectMaterialReceiptSchema = createInsertSchema(projectMaterialReceipts).omit({
  id: true,
  createdAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  purchaseOrderId: z.number().int().positive().optional(),
  materialId: z.number().int().positive().optional(),
  receiptNumber: z.string().min(1, "Receipt number is required"),
  deliveryDate: z.union([z.date(), z.string()]).transform(val => val),
  quantityOrdered: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  quantityReceived: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  quantityAccepted: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()),
  quantityRejected: z.union([z.string(), z.number()]).transform(val => typeof val === 'string' ? val : val.toString()).default("0"),
  rejectionReason: z.string().optional(),
  condition: z.enum(['good', 'damaged', 'defective']).default('good'),
  receivedBy: z.string().optional(),
  inspectedBy: z.string().optional(),
  storageLocation: z.string().optional(),
  notes: z.string().optional(),
});

export const insertProjectLineItemLinkSchema = createInsertSchema(projectLineItemLinks).omit({
  id: true,
  createdAt: true,
}).extend({
  projectId: z.number().int().positive("Project ID is required"),
  lineItemId: z.number().int().positive("Line item ID is required"),
  taskId: z.number().int().positive().optional(),
  budgetLineId: z.number().int().positive().optional(),
  conversionNotes: z.string().optional(),
});



// Select types (existing)
export type Customer = typeof customers.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type Product = typeof products.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type ContractTemplate = typeof contractTemplates.$inferSelect;
export type ProposalTemplate = typeof proposalTemplates.$inferSelect;
export type PricingTable = typeof pricingTables.$inferSelect;
export type ProductAccessory = typeof productAccessories.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type LeadActivity = typeof leadActivities.$inferSelect;

// Comprehensive CRM select types
export type Account = typeof accounts.$inferSelect;
export type AccountRole = typeof accountRoles.$inferSelect;
export type Contact = typeof contacts.$inferSelect;
export type ContactRole = typeof contactRoles.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type Activity = typeof activities.$inferSelect;

// Project Management select types
export type Project = typeof projects.$inferSelect;
export type ProjectMilestone = typeof projectMilestones.$inferSelect;
export type ProjectTask = typeof projectTasks.$inferSelect;
export type ProjectTaskDependency = typeof projectTaskDependencies.$inferSelect;
export type ProjectTaskAssignment = typeof projectTaskAssignments.$inferSelect;
export type ProjectScheduleEvent = typeof projectScheduleEvents.$inferSelect;
export type ProjectBudgetLine = typeof projectBudgetLines.$inferSelect;
export type ProjectPurchaseOrder = typeof projectPurchaseOrders.$inferSelect;
export type ProjectMaterialReceipt = typeof projectMaterialReceipts.$inferSelect;
export type ProjectLineItemLink = typeof projectLineItemLinks.$inferSelect;
export type ProjectCrew = typeof projectCrew.$inferSelect;
export type ProjectEquipment = typeof projectEquipment.$inferSelect;
export type ProjectProgress = typeof projectProgress.$inferSelect;
export type ProjectTimeEntry = typeof projectTimeEntries.$inferSelect;
export type ProjectMaterial = typeof projectMaterials.$inferSelect;
export type ProjectChangeOrder = typeof projectChangeOrders.$inferSelect;
export type ProjectFinancial = typeof projectFinancials.$inferSelect;

// Insert types (existing)
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type InsertQuote = z.infer<typeof insertQuoteSchema>;
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type InsertLineItem = z.infer<typeof insertLineItemSchema>;
export type InsertContractTemplate = z.infer<typeof insertContractTemplateSchema>;
export type InsertProposalTemplate = z.infer<typeof insertProposalTemplateSchema>;
export type InsertPricingTable = z.infer<typeof insertPricingTableSchema>;
export type InsertProductAccessory = z.infer<typeof insertProductAccessorySchema>;
export type InsertLead = z.infer<typeof insertLeadSchema>;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type InsertLeadActivity = z.infer<typeof insertLeadActivitySchema>;

// Comprehensive CRM insert types
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type InsertAccountRole = z.infer<typeof insertAccountRoleSchema>;
export type InsertContact = z.infer<typeof insertContactSchema>;
export type InsertContactRole = z.infer<typeof insertContactRoleSchema>;
export type InsertOpportunity = z.infer<typeof insertOpportunitySchema>;
export type InsertActivity = z.infer<typeof insertActivitySchema>;

// Project Management insert types
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type InsertProjectMilestone = z.infer<typeof insertProjectMilestoneSchema>;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;
export type InsertProjectTaskDependency = z.infer<typeof insertProjectTaskDependencySchema>;
export type InsertProjectTaskAssignment = z.infer<typeof insertProjectTaskAssignmentSchema>;
export type InsertProjectScheduleEvent = z.infer<typeof insertProjectScheduleEventSchema>;
export type InsertProjectBudgetLine = z.infer<typeof insertProjectBudgetLineSchema>;
export type InsertProjectPurchaseOrder = z.infer<typeof insertProjectPurchaseOrderSchema>;
export type InsertProjectMaterialReceipt = z.infer<typeof insertProjectMaterialReceiptSchema>;
export type InsertProjectLineItemLink = z.infer<typeof insertProjectLineItemLinkSchema>;
export type InsertProjectCrew = z.infer<typeof insertProjectCrewSchema>;
export type InsertProjectEquipment = z.infer<typeof insertProjectEquipmentSchema>;
export type InsertProjectProgress = z.infer<typeof insertProjectProgressSchema>;
export type InsertProjectTimeEntry = z.infer<typeof insertProjectTimeEntrySchema>;
export type InsertProjectMaterial = z.infer<typeof insertProjectMaterialSchema>;
export type InsertProjectChangeOrder = z.infer<typeof insertProjectChangeOrderSchema>;
export type InsertProjectFinancial = z.infer<typeof insertProjectFinancialSchema>;

export type QuoteWithDetails = Quote & {
  customer: Customer;
  lineItems: LineItem[];
  contractTemplate?: ContractTemplate;
  proposalTemplate?: ProposalTemplate;
};

// DTO types for API responses that include calculated fields
export type QuoteListItem = QuoteWithDetails & {
  total: number;
};

export type QuoteDetail = QuoteListItem & {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  shippingAmount: number;
  margin: number;
  totalMarkup: number;
};

export type ProductWithDetails = Product & {
  pricingTables?: PricingTable[];
  accessories?: (ProductAccessory & { accessory: Product })[];
};

// Project Management DTO types for complex queries and API responses
export type ProjectWithDetails = Project & {
  quote: Quote;
  account: Account;
  primaryContact?: Contact;
  opportunity?: Opportunity;
  projectManager?: User;
  milestones?: ProjectMilestone[];
  tasks?: ProjectTask[];
  taskAssignments?: ProjectTaskAssignment[];
  scheduleEvents?: ProjectScheduleEvent[];
  budgetLines?: ProjectBudgetLine[];
  purchaseOrders?: ProjectPurchaseOrder[];
  lineItemLinks?: ProjectLineItemLink[];
  crew?: ProjectCrew[];
  equipment?: ProjectEquipment[];
  financials?: ProjectFinancial;
};

export type ProjectListItem = Project & {
  account: Pick<Account, 'id' | 'name' | 'type'>;
  primaryContact?: Pick<Contact, 'id' | 'firstName' | 'lastName' | 'email'>;
  projectManager?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  milestoneCount: number;
  taskCount: number;
  completedTaskCount: number;
  progressPercentage: number;
  daysRemaining?: number;
  isOverdue: boolean;
};

export type ProjectTaskWithDetails = ProjectTask & {
  project: Pick<Project, 'id' | 'name' | 'status'>;
  parentTask?: Pick<ProjectTask, 'id' | 'title'>;
  milestone?: Pick<ProjectMilestone, 'id' | 'name'>;
  assignedUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  dependencies?: (ProjectTaskDependency & { dependsOnTask: Pick<ProjectTask, 'id' | 'title' | 'status'> })[];
  dependents?: (ProjectTaskDependency & { task: Pick<ProjectTask, 'id' | 'title' | 'status'> })[];
  timeEntries?: ProjectTimeEntry[];
  progressEntries?: ProjectProgress[];
  materials?: ProjectMaterial[];
  subtasks?: ProjectTask[];
};

export type ProjectProgressWithDetails = ProjectProgress & {
  project: Pick<Project, 'id' | 'name'>;
  task?: Pick<ProjectTask, 'id' | 'title'>;
  milestone?: Pick<ProjectMilestone, 'id' | 'name'>;
  createdByUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  crewMembers?: Pick<ProjectCrew, 'id' | 'userId' | 'externalContractorName' | 'role'>[];
};

export type ProjectFinancialSummary = ProjectFinancial & {
  project: Pick<Project, 'id' | 'name' | 'status'>;
  totalTimeEntries: number;
  totalMaterials: number;
  totalChangeOrders: number;
  laborVariance: number;
  materialVariance: number;
  scheduleVariance: number;
  profitabilityStatus: 'excellent' | 'good' | 'concern' | 'poor';
};

export type ProjectCrewWithDetails = ProjectCrew & {
  project: Pick<Project, 'id' | 'name'>;
  user?: Pick<User, 'id' | 'firstName' | 'lastName' | 'email'>;
  assignedTasks?: Pick<ProjectTask, 'id' | 'title' | 'status'>[];
  timeEntries?: Pick<ProjectTimeEntry, 'id' | 'workDate' | 'hoursWorked' | 'laborCost'>[];
  totalHours: number;
  totalCost: number;
};

export type ProjectChangeOrderWithDetails = ProjectChangeOrder & {
  project: Pick<Project, 'id' | 'name'>;
  requestedByUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  clientApprovedByContact?: Pick<Contact, 'id' | 'firstName' | 'lastName'>;
  internalApprovedByUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  implementedByUser?: Pick<User, 'id' | 'firstName' | 'lastName'>;
  impactedTaskDetails?: Pick<ProjectTask, 'id' | 'title' | 'status'>[];
};

export type ProjectTimeTrackingSummary = {
  projectId: number;
  crewMemberId?: number;
  taskId?: number;
  totalHours: number;
  totalCost: number;
  averageHourlyRate: number;
  overtimeHours: number;
  overtimeCost: number;
  entriesCount: number;
  dateRange: {
    start: string;
    end: string;
  };
};

export type ProjectMaterialUsageSummary = {
  projectId: number;
  taskId?: number;
  materialType?: string;
  totalOrdered: number;
  totalDelivered: number;
  totalUsed: number;
  totalWasted: number;
  totalCost: number;
  utilizationRate: number;
  wasteRate: number;
  supplierPerformance: number;
};

// Composite progress photo and document metadata types
export interface ProgressPhoto extends ImageMetadata {
  photoType: 'daily_progress' | 'milestone_completion' | 'issue_documentation' | 'quality_check' | 'safety_incident' | 'client_walkthrough';
  gpsLocation?: {
    latitude: number;
    longitude: number;
  };
  weatherConditions?: string;
  relatedTaskId?: number;
  relatedMilestoneId?: number;
}

export interface ProgressDocument {
  url: string;
  filename: string;
  documentType: 'permit' | 'inspection_report' | 'change_order' | 'material_delivery' | 'safety_report' | 'client_approval' | 'invoice' | 'other';
  description?: string;
  uploadedAt: string;
  size?: number;
  relatedTaskId?: number;
  relatedMilestoneId?: number;
}

// Image metadata types
export interface ImageMetadata {
  url: string;
  filename: string;
  caption?: string;
  altText?: string;
  uploadedAt: string;
  size?: number;
  thumbnailUrl?: string;
}

export interface ProjectImage extends ImageMetadata {
  category: 'before' | 'during' | 'after' | 'other';
}

export interface PortfolioImage extends ImageMetadata {
  projectType?: string;
  featured?: boolean;
}

export interface TechnicalDiagram extends ImageMetadata {
  diagramType: 'floorplan' | 'elevation' | 'detail' | 'specification' | 'other';
}

export interface CompanyImage extends ImageMetadata {
  imageType: 'logo' | 'team' | 'facility' | 'certification' | 'other';
}

export interface ProductImage extends ImageMetadata {
  imageType: 'primary' | 'gallery' | 'specification';
  displayOrder?: number;
}

// Template configuration types
export interface TemplateSection {
  id: string;
  name: string;
  order: number;
  required: boolean;
  defaultContent?: string;
}

export interface LayoutSettings {
  pageSize: 'A4' | 'letter';
  margins: {
    top: number;
    bottom: number;
  left: number;
    right: number;
  };
  spacing: {
    sectionGap: number;
    paragraphGap: number;
  };
  pageBreaks: {
    beforeSections: string[];
    avoidBreakInSections: string[];
  };
}

export interface BrandingSettings {
  primaryColor: string;
  accentColor: string;
  textColor: string;
  backgroundColor: string;
  logoSize: 'small' | 'medium' | 'large';
  headerStyle: 'minimal' | 'standard' | 'formal';
  footerStyle: 'minimal' | 'standard' | 'detailed';
}

export interface DefaultContent {
  companyDescription?: string;
  projectScope?: string;
  timeline?: string;
  credentials?: string;
  warranty?: string;
  paymentTerms?: string;
  additionalTerms?: string;
}

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
