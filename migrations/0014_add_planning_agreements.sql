CREATE TABLE IF NOT EXISTS "planning_agreements" (
  "id" serial PRIMARY KEY NOT NULL,
  "account_id" integer,
  "quote_id" integer,
  "quote_family_root_id" integer,
  "status" text DEFAULT 'required' NOT NULL,
  "tier" text DEFAULT 'standard_design' NOT NULL,
  "amount" numeric(10, 2) DEFAULT '0' NOT NULL,
  "credit_eligible" boolean DEFAULT true NOT NULL,
  "credit_expires_at" timestamp,
  "scope_summary" text,
  "internal_notes" text,
  "agreement_sent_at" timestamp,
  "agreement_signed_at" timestamp,
  "payment_confirmed_at" timestamp,
  "payment_confirmed_by" integer,
  "payment_method" text,
  "payment_reference" text,
  "payment_notes" text,
  "waived_at" timestamp,
  "waived_by" integer,
  "waiver_reason" text,
  "delivered_at" timestamp,
  "delivered_by" integer,
  "credited_quote_id" integer,
  "credited_at" timestamp,
  "applied_credit_amount" numeric(10, 2) DEFAULT '0' NOT NULL,
  "created_by" integer,
  "created_at" timestamp DEFAULT now(),
  "updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "planning_agreement_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "planning_agreement_id" integer NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" integer,
  "from_status" text,
  "to_status" text,
  "payload" jsonb,
  "created_at" timestamp DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_account_id_accounts_id_fk"
    FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_quote_id_quotes_id_fk"
    FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_quote_family_root_id_quotes_id_fk"
    FOREIGN KEY ("quote_family_root_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_payment_confirmed_by_users_id_fk"
    FOREIGN KEY ("payment_confirmed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_waived_by_users_id_fk"
    FOREIGN KEY ("waived_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_delivered_by_users_id_fk"
    FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_credited_quote_id_quotes_id_fk"
    FOREIGN KEY ("credited_quote_id") REFERENCES "public"."quotes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreements" ADD CONSTRAINT "planning_agreements_created_by_users_id_fk"
    FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreement_events" ADD CONSTRAINT "planning_agreement_events_planning_agreement_id_fk"
    FOREIGN KEY ("planning_agreement_id") REFERENCES "public"."planning_agreements"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "planning_agreement_events" ADD CONSTRAINT "planning_agreement_events_actor_user_id_users_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "idx_planning_agreements_account_id" ON "planning_agreements" ("account_id");
CREATE INDEX IF NOT EXISTS "idx_planning_agreements_quote_id" ON "planning_agreements" ("quote_id");
CREATE INDEX IF NOT EXISTS "idx_planning_agreements_quote_family_root_id" ON "planning_agreements" ("quote_family_root_id");
CREATE INDEX IF NOT EXISTS "idx_planning_agreements_status" ON "planning_agreements" ("status");
CREATE INDEX IF NOT EXISTS "idx_planning_agreements_payment_confirmed_at" ON "planning_agreements" ("payment_confirmed_at");
CREATE INDEX IF NOT EXISTS "idx_planning_agreements_credit_expires_at" ON "planning_agreements" ("credit_expires_at");
CREATE INDEX IF NOT EXISTS "idx_planning_agreement_events_agreement_id" ON "planning_agreement_events" ("planning_agreement_id");
CREATE INDEX IF NOT EXISTS "idx_planning_agreement_events_created_at" ON "planning_agreement_events" ("created_at");
