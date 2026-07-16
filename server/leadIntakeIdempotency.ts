import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, ensureLeadIntakeSubmissionTable } from "./db";
import { accounts, leadIntakeSubmissions } from "@shared/schema";
import { LeadIntakeIdempotencyError } from "./leadSubmissionIdentity";

export {
  LeadIntakeIdempotencyError,
  resolveLeadIntakeSubmissionId,
} from "./leadSubmissionIdentity";

type LeadIntakeAccount = {
  id: number;
  leadStatus?: string | null;
};

export type LeadIntakeDatabase = Pick<typeof db, "select" | "insert" | "update">;

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(object[key])}`)
    .join(",")}}`;
}

function payloadHash(payload: unknown) {
  return createHash("sha256").update(stableJson(payload)).digest("hex");
}

async function getAccountById(
  database: LeadIntakeDatabase,
  accountId: number
): Promise<LeadIntakeAccount> {
  const [account] = await database
    .select({ id: accounts.id, leadStatus: accounts.leadStatus })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  if (!account) {
    throw new LeadIntakeIdempotencyError(
      500,
      "Lead intake submission references an unavailable account"
    );
  }

  return account;
}

export async function createIdempotentLead<Account extends LeadIntakeAccount>({
  submissionId,
  lead,
  createLead,
}: {
  submissionId?: string;
  lead: { email: string };
  createLead: (database: LeadIntakeDatabase) => Promise<Account>;
}): Promise<{ account: Account | LeadIntakeAccount; replayed: boolean }> {
  if (!submissionId) {
    return { account: await createLead(db), replayed: false };
  }

  await ensureLeadIntakeSubmissionTable();
  const hash = payloadHash(lead);

  return db.transaction(async (transaction) => {
    const database = transaction as unknown as LeadIntakeDatabase;
    const [reservation] = await database
      .insert(leadIntakeSubmissions)
      .values({ submissionId, payloadHash: hash })
      .onConflictDoNothing()
      .returning({ submissionId: leadIntakeSubmissions.submissionId });

    if (!reservation) {
      const [existingSubmission] = await database
        .select({
          payloadHash: leadIntakeSubmissions.payloadHash,
          accountId: leadIntakeSubmissions.accountId,
        })
        .from(leadIntakeSubmissions)
        .where(eq(leadIntakeSubmissions.submissionId, submissionId))
        .limit(1);

      if (!existingSubmission || existingSubmission.payloadHash !== hash) {
        throw new LeadIntakeIdempotencyError(
          409,
          "This idempotency key was already used for a different lead"
        );
      }

      if (!existingSubmission.accountId) {
        throw new LeadIntakeIdempotencyError(
          409,
          "Lead intake is already in progress. Please retry shortly."
        );
      }

      return {
        account: await getAccountById(database, existingSubmission.accountId),
        replayed: true,
      };
    }

    const account = await createLead(database);
    await database
      .update(leadIntakeSubmissions)
      .set({ accountId: account.id, completedAt: new Date() })
      .where(eq(leadIntakeSubmissions.submissionId, submissionId));

    return { account, replayed: false };
  });
}
