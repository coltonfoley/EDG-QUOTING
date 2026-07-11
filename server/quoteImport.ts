import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { accounts, lineItems, quotes } from "@shared/schema";
import { db } from "./db";
import { assertQuoteMutationAllowed } from "./quoteLock";
import { appendBusinessEvent } from "./businessEvents";

const nullableText = z.string().trim().max(10_000).nullable().optional();

const extractedCustomerSchema = z.object({
  name: nullableText,
  firstName: nullableText,
  lastName: nullableText,
  email: nullableText,
  phone: nullableText,
  company: nullableText,
  address: nullableText,
  streetAddress: nullableText,
  addressLine2: nullableText,
  city: nullableText,
  state: nullableText,
  zipCode: nullableText,
  country: nullableText,
});

const extractedLineItemSchema = z.object({
  description: z.string().trim().min(1, "Every imported line needs a description").max(10_000),
  quantity: z.number().finite().positive("Every imported quantity must be greater than zero"),
  price: z.number().finite().nonnegative("Every imported price must be zero or greater"),
  total: z.number().finite().nonnegative().nullable().optional(),
  unit: z.string().trim().max(100).nullable().optional(),
});

const extractedQuoteSchema = z.object({
  pdfId: z.string().trim().min(1).max(200),
  filename: z.string().trim().min(1).max(255),
  customer: extractedCustomerSchema,
  quoteNumber: nullableText,
  date: nullableText,
  projectDescription: nullableText,
  lineItems: z.array(extractedLineItemSchema).min(1, "Every imported quote needs at least one line item").max(500),
  subtotal: z.number().finite().nonnegative().nullable().optional(),
  taxRate: z.number().finite().min(0).max(100).nullable().optional(),
  taxAmount: z.number().finite().nonnegative().nullable().optional(),
  discountAmount: z.number().finite().nonnegative().nullable().optional(),
  total: z.number().finite().nonnegative().nullable().optional(),
  notes: nullableText,
  terms: nullableText,
  confidence: z.number().finite().min(0).max(1).optional(),
});

export const quoteImportRequestSchema = z.object({
  importOptions: z.object({
    createNewQuote: z.boolean(),
    combineIntoSingleQuote: z.boolean().default(false),
    existingQuoteId: z.number().int().positive().optional(),
    attachCustomer: z.enum(["auto", "none", "match_only"]).default("match_only"),
    existingCustomerId: z.number().int().positive().optional(),
    priceMeaning: z.enum(["customer_unit_price", "edg_cost"]).default("customer_unit_price"),
    defaultMarkupPercent: z.number().finite().min(0).max(10_000).default(0),
  }),
  extractedQuotes: z.array(extractedQuoteSchema).min(1).max(20),
}).superRefine((data, context) => {
  if (!data.importOptions.createNewQuote && !data.importOptions.existingQuoteId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["importOptions", "existingQuoteId"],
      message: "Choose the existing quote that should receive these lines",
    });
  }
  if (!data.importOptions.createNewQuote && data.importOptions.combineIntoSingleQuote) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["importOptions", "combineIntoSingleQuote"],
      message: "Combine is only available when creating a new quote",
    });
  }
});

export type QuoteImportRequest = z.infer<typeof quoteImportRequestSchema>;

export class QuoteImportError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 409) {
    super(message);
    this.name = "QuoteImportError";
    this.code = code;
    this.status = status;
  }
}

type ImportTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ExtractedCustomer = QuoteImportRequest["extractedQuotes"][number]["customer"];

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

async function findMatchingAccount(tx: ImportTransaction, customer: ExtractedCustomer) {
  const email = clean(customer.email)?.toLowerCase();
  if (email) {
    const [match] = await tx
      .select()
      .from(accounts)
      .where(sql`lower(btrim(${accounts.email})) = ${email}`)
      .limit(1);
    if (match) return match;
  }

  const company = clean(customer.company)?.toLowerCase();
  if (company) {
    const [match] = await tx
      .select()
      .from(accounts)
      .where(sql`lower(btrim(coalesce(${accounts.company}, ''))) = ${company}`)
      .limit(1);
    if (match) return match;
  }

  const extractedName = clean(customer.name)
    || [clean(customer.firstName), clean(customer.lastName)].filter(Boolean).join(" ");
  if (extractedName) {
    const [match] = await tx
      .select()
      .from(accounts)
      .where(sql`lower(btrim(${accounts.name})) = ${extractedName.toLowerCase()}`)
      .limit(1);
    if (match) return match;
  }

  return undefined;
}

async function resolveAccount(
  tx: ImportTransaction,
  customer: ExtractedCustomer,
  options: QuoteImportRequest["importOptions"],
): Promise<{ accountId: number | null; wasCreated: boolean }> {
  // An explicit selection always wins over extracted or matched identity.
  if (options.existingCustomerId) {
    const [selected] = await tx
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.id, options.existingCustomerId))
      .limit(1);
    if (!selected) {
      throw new QuoteImportError("IMPORT_ACCOUNT_NOT_FOUND", "The selected client no longer exists.", 404);
    }
    return { accountId: selected.id, wasCreated: false };
  }

  if (options.attachCustomer === "none") return { accountId: null, wasCreated: false };

  const matched = await findMatchingAccount(tx, customer);
  if (matched) return { accountId: matched.id, wasCreated: false };
  if (options.attachCustomer === "match_only") return { accountId: null, wasCreated: false };

  const firstName = clean(customer.firstName);
  const lastName = clean(customer.lastName);
  const company = clean(customer.company);
  const name = clean(customer.name) || [firstName, lastName].filter(Boolean).join(" ") || company || "Imported client";
  const [created] = await tx
    .insert(accounts)
    .values({
      name,
      firstName,
      lastName,
      email: clean(customer.email) || `import+${randomUUID()}@invalid.example`,
      phone: clean(customer.phone) || "",
      company,
      accountType: company ? "commercial" : "homeowner",
      paymentTerms: "net_30",
      billingAddress: clean(customer.address),
      streetAddress: clean(customer.streetAddress),
      addressLine2: clean(customer.addressLine2),
      city: clean(customer.city),
      state: clean(customer.state),
      zipCode: clean(customer.zipCode),
      country: clean(customer.country),
    })
    .returning({ id: accounts.id });
  return { accountId: created.id, wasCreated: true };
}

function generatedQuoteNumber(): string {
  return `IMP-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function discountPercent(extracted: QuoteImportRequest["extractedQuotes"][number]): string {
  const subtotal = extracted.subtotal ?? 0;
  const discount = extracted.discountAmount ?? 0;
  if (subtotal <= 0 || discount <= 0) return "0";
  return Math.min(100, (discount / subtotal) * 100).toFixed(2);
}

async function insertImportedLines(
  tx: ImportTransaction,
  quoteId: number,
  extracted: QuoteImportRequest["extractedQuotes"][number],
  options: QuoteImportRequest["importOptions"],
  startPosition: number,
  prefixFilename = false,
): Promise<number> {
  const values = extracted.lineItems.map((item, index) => ({
    quoteId,
    description: prefixFilename ? `[${extracted.filename}] ${item.description}` : item.description,
    quantity: item.quantity.toString(),
    unitPrice: item.price.toString(),
    markupType: "percentage",
    markupValue: options.priceMeaning === "edg_cost" ? options.defaultMarkupPercent.toString() : "0",
    discountType: "percentage",
    discountValue: "0",
    unit: clean(item.unit),
    priceSource: options.priceMeaning === "edg_cost" ? "import_edg_cost" : "import_customer_price",
    sourceMetadata: {
      source: "quote_pdf_import",
      pdfId: extracted.pdfId,
      filename: extracted.filename,
      extractionConfidence: extracted.confidence ?? null,
      originalLineIndex: index,
      extractedTotal: item.total ?? null,
      priceMeaning: options.priceMeaning,
    },
    position: startPosition + index,
  }));

  await tx.insert(lineItems).values(values);
  return values.length;
}

async function createImportedQuote(
  tx: ImportTransaction,
  extracted: QuoteImportRequest["extractedQuotes"][number],
  accountId: number | null,
  projectName?: string,
  internalSourceNote?: string,
) {
  const [created] = await tx
    .insert(quotes)
    .values({
      quoteNumber: clean(extracted.quoteNumber) || generatedQuoteNumber(),
      accountId,
      projectName: projectName || clean(extracted.projectDescription) || `Imported quote (${extracted.pdfId})`,
      jobsiteStreetAddress: clean(extracted.customer.streetAddress),
      jobsiteAddressLine2: clean(extracted.customer.addressLine2),
      jobsiteCity: clean(extracted.customer.city),
      jobsiteState: clean(extracted.customer.state),
      jobsiteZipCode: clean(extracted.customer.zipCode),
      jobsiteCountry: clean(extracted.customer.country),
      estimatedStartDate: clean(extracted.date),
      notes: clean(extracted.notes),
      internalNotes: internalSourceNote || `Imported from PDF source: ${extracted.filename}`,
      customContractTerms: clean(extracted.terms),
      taxRate: (extracted.taxRate ?? 0).toString(),
      tariffRate: "0",
      discount: discountPercent(extracted),
      shipping: "0",
      isShippingTaxable: false,
      dealStage: "new_lead",
      esigIncludeApprovalDrawing: false,
    })
    .returning();
  return created;
}

export async function executeQuoteImport(input: QuoteImportRequest, actorUserId?: number) {
  const data = quoteImportRequestSchema.parse(input);

  try {
    return await db.transaction(async (tx) => {
      const imported: Array<{
        pdfId: string;
        quoteId: number;
        quoteNumber: string;
        lineItemsAdded: number;
        action: "created" | "added_to_existing";
      }> = [];
      let quotesCreated = 0;
      let lineItemsAdded = 0;
      let customersCreated = 0;

      if (!data.importOptions.createNewQuote) {
        const [targetQuote] = await tx
          .select()
          .from(quotes)
          .where(eq(quotes.id, data.importOptions.existingQuoteId!))
          .for("update");
        if (!targetQuote) {
          throw new QuoteImportError("IMPORT_QUOTE_NOT_FOUND", "The selected quote no longer exists.", 404);
        }
        assertQuoteMutationAllowed(targetQuote);

        const [positionRow] = await tx
          .select({ maxPosition: sql<number>`coalesce(max(${lineItems.position}), -1)` })
          .from(lineItems)
          .where(eq(lineItems.quoteId, targetQuote.id));
        let nextPosition = Number(positionRow?.maxPosition ?? -1) + 1;

        for (const extracted of data.extractedQuotes) {
          const added = await insertImportedLines(tx, targetQuote.id, extracted, data.importOptions, nextPosition);
          nextPosition += added;
          lineItemsAdded += added;
          imported.push({
            pdfId: extracted.pdfId,
            quoteId: targetQuote.id,
            quoteNumber: targetQuote.quoteNumber,
            lineItemsAdded: added,
            action: "added_to_existing",
          });
        }
        await tx.update(quotes).set({ updatedAt: new Date() }).where(eq(quotes.id, targetQuote.id));
      } else if (data.importOptions.combineIntoSingleQuote && data.extractedQuotes.length > 1) {
        const first = data.extractedQuotes[0];
        const account = await resolveAccount(tx, first.customer, data.importOptions);
        customersCreated += account.wasCreated ? 1 : 0;
        const projectName = data.extractedQuotes
          .map((quote) => clean(quote.projectDescription))
          .filter(Boolean)
          .join(" | ") || `Combined import (${data.extractedQuotes.length} PDFs)`;
        const created = await createImportedQuote(
          tx,
          first,
          account.accountId,
          projectName,
          `Combined PDF import (${data.extractedQuotes.map((quote) => quote.filename).join(", ")})`,
        );
        quotesCreated += 1;
        let nextPosition = 0;
        for (const extracted of data.extractedQuotes) {
          const added = await insertImportedLines(tx, created.id, extracted, data.importOptions, nextPosition, true);
          nextPosition += added;
          lineItemsAdded += added;
          imported.push({
            pdfId: extracted.pdfId,
            quoteId: created.id,
            quoteNumber: created.quoteNumber,
            lineItemsAdded: added,
            action: "created",
          });
        }
      } else {
        const requestedQuoteNumbers = new Set<string>();
        for (const extracted of data.extractedQuotes) {
          const requestedQuoteNumber = clean(extracted.quoteNumber)?.toLowerCase();
          if (requestedQuoteNumber && requestedQuoteNumbers.has(requestedQuoteNumber)) {
            throw new QuoteImportError(
              "IMPORT_DUPLICATE_RECORD",
              "Two PDFs use the same quote number. Review the quote numbers and try again.",
              409,
            );
          }
          if (requestedQuoteNumber) requestedQuoteNumbers.add(requestedQuoteNumber);
          const account = await resolveAccount(tx, extracted.customer, data.importOptions);
          customersCreated += account.wasCreated ? 1 : 0;
          const created = await createImportedQuote(tx, extracted, account.accountId);
          const added = await insertImportedLines(tx, created.id, extracted, data.importOptions, 0);
          quotesCreated += 1;
          lineItemsAdded += added;
          imported.push({
            pdfId: extracted.pdfId,
            quoteId: created.id,
            quoteNumber: created.quoteNumber,
            lineItemsAdded: added,
            action: "created",
          });
        }
      }

      await appendBusinessEvent(tx, {
        eventType: "quote_import_completed",
        eventKey: `quote_import_completed:${randomUUID()}`,
        quoteId: imported[0]?.quoteId ?? null,
        actorUserId,
      });

      return {
        success: true,
        imported,
        errors: [],
        summary: { quotesCreated, lineItemsAdded, customersCreated, failed: 0 },
      };
    });
  } catch (error: any) {
    if (error instanceof QuoteImportError || error?.name === "QuoteSignedLockedError") throw error;
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      throw new QuoteImportError(
        "IMPORT_DUPLICATE_RECORD",
        "The import conflicts with an existing quote number. Review the quote numbers and try again.",
        409,
      );
    }
    throw error;
  }
}
