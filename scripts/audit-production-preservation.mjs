import crypto from "node:crypto";
import fs from "node:fs";
import dotenv from "dotenv";
import pg from "pg";

const { Pool } = pg;

const envFile = process.env.RAINMAKER_AUDIT_ENV_FILE;
if (envFile) {
  if (!fs.existsSync(envFile)) {
    throw new Error(`Audit environment file does not exist: ${envFile}`);
  }
  dotenv.config({ path: envFile, override: false });
} else {
  dotenv.config();
}

if (process.env.ALLOW_PRODUCTION_READ_ONLY_AUDIT !== "true") {
  throw new Error("Set ALLOW_PRODUCTION_READ_ONLY_AUDIT=true to acknowledge the read-only production audit.");
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for the preservation audit.");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  statement_timeout: 30_000,
  query_timeout: 35_000,
});

const report = {
  generatedAt: new Date().toISOString(),
  mode: "production-read-only",
  transactionReadOnly: false,
  tables: {},
  signedQuoteIntegrity: null,
  quoteFamilies: null,
  planningAgreements: [],
  approvalDrawings: [],
  quickBooksCompatibility: null,
  issueReportCompatibility: null,
  legacyFieldReferences: null,
  orphanChecks: null,
  storageReferences: [],
  productAssetReferences: null,
  notes: [
    "The audit returns aggregate counts and dates only; it does not print customer content, tokens, URLs, or document bodies.",
    "The aggregate checksum proves this report payload is stable; it is not a database backup checksum.",
  ],
};

const client = await pool.connect();

async function tableExists(name) {
  const result = await client.query(
    `select exists (
       select 1
       from information_schema.tables
       where table_schema = 'public' and table_name = $1
     ) as present`,
    [name],
  );
  return Boolean(result.rows[0]?.present);
}

async function rowsIfTable(tableName, sql) {
  if (!(await tableExists(tableName))) return [];
  return (await client.query(sql)).rows;
}

try {
  await client.query("begin transaction read only");
  const readOnly = await client.query("show transaction_read_only");
  report.transactionReadOnly = readOnly.rows[0]?.transaction_read_only === "on";
  if (!report.transactionReadOnly) {
    throw new Error("Database did not confirm a read-only transaction.");
  }

  const trackedTables = [
    "accounts",
    "lead_attachments",
    "lead_intake_submissions",
    "quickbooks_settings",
    "quotes",
    "planning_agreements",
    "planning_agreement_events",
    "quote_approval_drawings",
    "quote_cover_photos",
    "quote_product_renderings",
    "contract_templates",
    "products",
    "pricing_defaults",
    "pricing_tables",
    "colors",
    "product_colors",
    "groups",
    "line_items",
    "issue_reports",
  ];

  for (const tableName of trackedTables) {
    if (await tableExists(tableName)) {
      const result = await client.query(`select count(*)::int as count from "${tableName}"`);
      report.tables[tableName] = result.rows[0].count;
    } else {
      report.tables[tableName] = null;
    }
  }

  if ((await tableExists("quotes")) && (await tableExists("line_items"))) {
    const signedIntegrity = await client.query(`
      with signed_quotes as (
        select q.*
        from quotes q
        where q.client_signed_at is not null
           or q.company_signed_at is not null
           or q.signed_document_snapshot is not null
      ),
      live_line_totals as (
        select
          li.quote_id,
          round(sum(
            case
              when coalesce(li.quantity, 0)::numeric <= 0 then
                round(
                  (
                    case
                      when coalesce(li.discount_type, 'percentage') = 'dollar'
                        then greatest(0, coalesce(li.quantity, 0)::numeric * coalesce(li.unit_price, 0)::numeric - greatest(0, coalesce(li.discount_value, 0)::numeric))
                      else greatest(0, coalesce(li.quantity, 0)::numeric * coalesce(li.unit_price, 0)::numeric * (1 - least(100, greatest(0, coalesce(li.discount_value, 0)::numeric)) / 100))
                    end
                  )
                  * (1 + case when li.is_tariff_applicable then least(100, greatest(0, coalesce(q.tariff_rate, 0)::numeric)) / 100 else 0 end)
                  * (case when coalesce(li.markup_type, 'percentage') = 'dollar' then 1 else 1 + greatest(0, coalesce(li.markup_value, 0)::numeric) / 100 end)
                  + (case when coalesce(li.markup_type, 'percentage') = 'dollar' then greatest(0, coalesce(li.markup_value, 0)::numeric) else 0 end),
                  2
                )
              else
                round(
                  (
                    case
                      when coalesce(li.discount_type, 'percentage') = 'dollar'
                        then greatest(0, li.quantity::numeric * li.unit_price::numeric - greatest(0, coalesce(li.discount_value, 0)::numeric))
                      else greatest(0, li.quantity::numeric * li.unit_price::numeric * (1 - least(100, greatest(0, coalesce(li.discount_value, 0)::numeric)) / 100))
                    end
                  )
                  * (1 + case when li.is_tariff_applicable then least(100, greatest(0, coalesce(q.tariff_rate, 0)::numeric)) / 100 else 0 end)
                  * (case when coalesce(li.markup_type, 'percentage') = 'dollar' then 1 else 1 + greatest(0, coalesce(li.markup_value, 0)::numeric) / 100 end)
                  + (case when coalesce(li.markup_type, 'percentage') = 'dollar' then greatest(0, coalesce(li.markup_value, 0)::numeric) else 0 end),
                  2
                )
            end
          ), 2) as subtotal
        from line_items li
        join quotes q on q.id = li.quote_id
        group by li.quote_id
      ),
      snapshot_line_totals as (
        select
          q.id as quote_id,
          round(sum(
            case
              when jsonb_typeof(item) = 'object'
               and coalesce(item->>'quantity', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
               and coalesce(item->>'unitPrice', '') ~ '^-?[0-9]+(\\.[0-9]+)?$'
                then greatest(0, (item->>'quantity')::numeric) * greatest(0, (item->>'unitPrice')::numeric)
              else 0
            end
          ), 2) as subtotal
        from signed_quotes q
        cross join lateral jsonb_array_elements(coalesce(q.signed_document_snapshot->'lineItems', '[]'::jsonb)) item
        group by q.id
      ),
      assessed as (
        select
          q.id,
          q.signed_document_snapshot is null as missing_snapshot,
          (
            coalesce(q.quote_number, '') <> coalesce(q.signed_document_snapshot->>'quoteNumber', '')
            or coalesce(q.project_name, '') <> coalesce(q.signed_document_snapshot->>'projectName', '')
            or coalesce(q.tax_rate::text, '') <> coalesce(q.signed_document_snapshot->>'taxRate', '')
            or coalesce(q.discount::text, '') <> coalesce(q.signed_document_snapshot->>'discount', '')
            or coalesce(q.shipping::text, '') <> coalesce(q.signed_document_snapshot->>'shipping', '')
            or coalesce(q.notes, '') <> coalesce(q.signed_document_snapshot->>'notes', '')
            or coalesce(q.custom_contract_terms, '') <> coalesce(q.signed_document_snapshot->>'customContractTerms', '')
            or coalesce(q.esig_include_pricing, true) <> coalesce((q.signed_document_snapshot->>'esigIncludePricing')::boolean, true)
            or coalesce(q.esig_include_images, false) <> coalesce((q.signed_document_snapshot->>'esigIncludeImages')::boolean, false)
            or coalesce(q.esig_include_contract, true) <> coalesce((q.signed_document_snapshot->>'esigIncludeContract')::boolean, true)
          ) as scope_mismatch,
          coalesce(jsonb_array_length(q.signed_document_snapshot->'lineItems'), 0)
            <> (select count(*) from line_items li where li.quote_id = q.id) as line_count_mismatch,
          exists (
            select 1
            from jsonb_array_elements(coalesce(q.signed_document_snapshot->'lineItems', '[]'::jsonb)) item
            left join line_items li
              on li.quote_id = q.id
             and coalesce(item->>'id', '') ~ '^[0-9]+$'
             and li.id = (item->>'id')::int
            where li.id is null
               or coalesce(li.description, '') <> coalesce(item->>'description', '')
               or coalesce(li.quantity, 0)::numeric <> coalesce(nullif(item->>'quantity', '')::numeric, 0)
               or coalesce(li.is_taxable, true) <> coalesce((item->>'isTaxable')::boolean, true)
               or coalesce(li.group_id, '') <> coalesce(item->>'groupId', '')
               or coalesce(li.position, 0) <> coalesce(nullif(item->>'position', '')::int, 0)
               or coalesce(li.sku, '') <> coalesce(item->>'sku', '')
          )
          or exists (
            select 1
            from line_items li
            where li.quote_id = q.id
              and not exists (
                select 1
                from jsonb_array_elements(coalesce(q.signed_document_snapshot->'lineItems', '[]'::jsonb)) item
                where coalesce(item->>'id', '') ~ '^[0-9]+$'
                  and (item->>'id')::int = li.id
              )
          ) as line_identity_or_content_mismatch,
          coalesce(llt.subtotal, 0) <> coalesce(slt.subtotal, 0) as public_line_subtotal_mismatch
        from signed_quotes q
        left join live_line_totals llt on llt.quote_id = q.id
        left join snapshot_line_totals slt on slt.quote_id = q.id
      )
      select
        count(*)::int as signed_or_snapshot_records,
        count(*) filter (where missing_snapshot)::int as missing_snapshot,
        count(*) filter (where scope_mismatch)::int as scope_mismatch,
        count(*) filter (where line_count_mismatch)::int as line_count_mismatch,
        count(*) filter (where line_identity_or_content_mismatch)::int as line_identity_or_content_mismatch,
        count(*) filter (where public_line_subtotal_mismatch)::int as public_line_subtotal_mismatch,
        count(*) filter (
          where missing_snapshot
             or scope_mismatch
             or line_count_mismatch
             or line_identity_or_content_mismatch
             or public_line_subtotal_mismatch
        )::int as any_detected_mismatch
      from assessed
    `);
    report.signedQuoteIntegrity = signedIntegrity.rows[0];

    const families = await client.query(`
      with families as (
        select
          coalesce(parent_quote_id, id) as family_root_id,
          count(*)::int as version_count,
          count(*) filter (where is_latest_version)::int as current_count
        from quotes
        group by coalesce(parent_quote_id, id)
      )
      select
        count(*)::int as family_count,
        count(*) filter (where current_count = 0)::int as families_with_no_current,
        count(*) filter (where current_count > 1)::int as families_with_multiple_current,
        count(*) filter (where version_count > 1)::int as multi_version_families,
        max(version_count)::int as max_versions_in_family
      from families
    `);
    report.quoteFamilies = families.rows[0];
  }

  report.planningAgreements = await rowsIfTable("planning_agreements", `
    select
      status,
      count(*)::int as count,
      min(created_at) as earliest_created_at,
      max(updated_at) as latest_updated_at
    from planning_agreements
    group by status
    order by status
  `);

  report.approvalDrawings = await rowsIfTable("quote_approval_drawings", `
    select
      status,
      order_status,
      count(*)::int as count,
      min(created_at) as earliest_created_at,
      max(updated_at) as latest_updated_at
    from quote_approval_drawings
    group by status, order_status
    order by status, order_status
  `);

  if ((await tableExists("quotes")) && (await tableExists("accounts")) && (await tableExists("quickbooks_settings"))) {
    report.quickBooksCompatibility = (await client.query(`
      select
        (select count(*)::int from quotes where qb_estimate_id is not null or qb_sync_status is not null or qb_synced_at is not null or qb_sync_error is not null) as quote_rows_with_qb_fields,
        (select count(*)::int from accounts where qb_customer_id is not null) as account_rows_with_qb_fields,
        (select count(*)::int from quickbooks_settings) as settings_rows,
        (select count(*)::int from quickbooks_settings where is_active) as active_settings_rows
    `)).rows[0];
  }

  if (await tableExists("issue_reports")) {
    report.issueReportCompatibility = (await client.query(`
      select
        count(*)::int as total_rows,
        count(*) filter (where status in ('open', 'in_progress'))::int as unresolved_rows,
        min(resolved_at) as earliest_resolved_at,
        max(resolved_at) as latest_resolved_at
      from issue_reports
    `)).rows[0];
  }

  if ((await tableExists("quotes")) && (await tableExists("accounts"))) {
    report.legacyFieldReferences = (await client.query(`
      select
        (select count(*)::int from accounts where nullif(trim(billing_address), '') is not null) as accounts_using_legacy_billing_address,
        (select count(*)::int from quotes where nullif(trim(jobsite_address), '') is not null) as quotes_using_legacy_jobsite_address,
        (select count(*)::int from quotes where nullif(trim(internal_notes), '') is not null) as quotes_with_internal_handoff_notes
    `)).rows[0];
  }

  const orphanParts = [];
  if ((await tableExists("groups")) && (await tableExists("quotes"))) {
    orphanParts.push(`(select count(*)::int from groups g left join quotes q on q.id = g.quote_id where q.id is null) as orphan_groups`);
  }
  if ((await tableExists("line_items")) && (await tableExists("quotes")) && (await tableExists("groups"))) {
    orphanParts.push(`(select count(*)::int from line_items li left join quotes q on q.id = li.quote_id where q.id is null) as orphan_line_items`);
    orphanParts.push(`(select count(*)::int from line_items li left join groups g on g.id = li.group_id where li.group_id is not null and (g.id is null or g.quote_id <> li.quote_id)) as invalid_line_item_group_links`);
  }
  if ((await tableExists("quote_cover_photos")) && (await tableExists("quotes"))) {
    orphanParts.push(`(select count(*)::int from quote_cover_photos p left join quotes q on q.id = p.quote_id where q.id is null) as orphan_cover_photos`);
  }
  if ((await tableExists("quote_product_renderings")) && (await tableExists("quotes"))) {
    orphanParts.push(`(select count(*)::int from quote_product_renderings p left join quotes q on q.id = p.quote_id where q.id is null) as orphan_product_renderings`);
  }
  if ((await tableExists("lead_attachments")) && (await tableExists("accounts"))) {
    orphanParts.push(`(select count(*)::int from lead_attachments a left join accounts ac on ac.id = a.account_id where ac.id is null) as orphan_lead_attachments`);
  }
  if ((await tableExists("pricing_tables")) && (await tableExists("products"))) {
    orphanParts.push(`(select count(*)::int from pricing_tables p left join products pr on pr.id = p.product_id where pr.id is null) as orphan_pricing_rows`);
  }
  if ((await tableExists("product_colors")) && (await tableExists("products")) && (await tableExists("colors"))) {
    orphanParts.push(`(select count(*)::int from product_colors pc left join products p on p.id = pc.product_id left join colors c on c.id = pc.color_id where p.id is null or c.id is null) as orphan_product_color_links`);
  }
  if (orphanParts.length > 0) {
    report.orphanChecks = (await client.query(`select ${orphanParts.join(",\n")}`)).rows[0];
  }

  const storageUnions = [];
  if (await tableExists("quote_cover_photos")) storageUnions.push("select storage_url from quote_cover_photos");
  if (await tableExists("quote_product_renderings")) storageUnions.push("select storage_url from quote_product_renderings");
  if (await tableExists("lead_attachments")) storageUnions.push("select storage_url from lead_attachments");
  if (storageUnions.length > 0) {
    report.storageReferences = (await client.query(`
      with refs as (${storageUnions.join(" union all ")})
      select
        case
          when storage_url like 'https://%.blob.vercel-storage.com/%' then 'vercel_blob'
          when storage_url like 'https://storage.googleapis.com/%' then 'google_cloud_storage'
          when storage_url like 'data:%' then 'inline_data_url'
          when storage_url like '/%' then 'relative_or_local_path'
          when storage_url like 'http://%' or storage_url like 'https://%' then 'other_remote_url'
          else 'unknown'
        end as provider,
        count(*)::int as count
      from refs
      group by provider
      order by provider
    `)).rows;
  }

  if (await tableExists("products")) {
    report.productAssetReferences = (await client.query(`
      select
        count(*) filter (where nullif(trim(primary_image), '') is not null)::int as products_with_primary_image,
        count(*) filter (where gallery_images is not null and gallery_images <> 'null'::jsonb)::int as products_with_gallery_images,
        count(*) filter (where specification_sheets is not null and specification_sheets <> 'null'::jsonb)::int as products_with_specification_sheets
      from products
    `)).rows[0];
  }

  await client.query("rollback");
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}

report.aggregateChecksumSha256 = crypto
  .createHash("sha256")
  .update(JSON.stringify(report))
  .digest("hex");

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
