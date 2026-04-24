import { neonConfig, Pool } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

neonConfig.webSocketConstructor = ws;

type PrimaryContactRow = {
  contactId: number;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  accountId: number;
  accountName: string;
  accountFirstName: string | null;
  accountLastName: string | null;
};

async function migrateContactsToAccounts() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log('\n=== Starting Contact to Account Migration ===\n');
  console.log('This script will copy firstName and lastName from primary contacts into their parent accounts.');
  console.log('Original contact records will be preserved for rollback safety.\n');

  try {
    const result = await pool.query(`
      SELECT
        c.id AS "contactId",
        c.first_name AS "contactFirstName",
        c.last_name AS "contactLastName",
        c.email AS "contactEmail",
        c.account_id AS "accountId",
        a.name AS "accountName",
        a.first_name AS "accountFirstName",
        a.last_name AS "accountLastName"
      FROM contacts c
      INNER JOIN accounts a ON c.account_id = a.id
      WHERE c.is_primary = true
    `) as { rows: PrimaryContactRow[] };
    const primaryContacts = result.rows;

    console.log(`Found ${primaryContacts.length} primary contacts to migrate.\n`);

    if (primaryContacts.length === 0) {
      console.log('No primary contacts found. Migration complete.');
      await pool.end();
      return;
    }

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;
    const updatedAccountIds = new Set<number>();

    for (const contact of primaryContacts) {
      const accountAlreadyHasName = contact.accountFirstName || contact.accountLastName;
      
      if (accountAlreadyHasName) {
        console.log(`⏭️  SKIP: Account ${contact.accountId} (${contact.accountName}) already has contact info:`);
        console.log(`   Current: ${contact.accountFirstName || '(none)'} ${contact.accountLastName || '(none)'}`);
        console.log(`   Primary Contact: ${contact.contactFirstName} ${contact.contactLastName}`);
        skippedCount++;
        continue;
      }

      if (updatedAccountIds.has(contact.accountId)) {
        console.log(`⏭️  SKIP: Account ${contact.accountId} (${contact.accountName}) already updated in this migration run`);
        console.log(`   Duplicate primary contact: ${contact.contactFirstName} ${contact.contactLastName}`);
        skippedCount++;
        continue;
      }

      try {
        await pool.query(
          `
            UPDATE accounts
            SET first_name = $1, last_name = $2
            WHERE id = $3
          `,
          [contact.contactFirstName, contact.contactLastName, contact.accountId]
        );

        console.log(`✅ UPDATE: Account ${contact.accountId} (${contact.accountName})`);
        console.log(`   Set: ${contact.contactFirstName} ${contact.contactLastName}`);
        console.log(`   From contact: ${contact.contactEmail}\n`);
        updatedAccountIds.add(contact.accountId);
        updatedCount++;
      } catch (error) {
        console.error(`❌ ERROR: Failed to update account ${contact.accountId}:`, error);
        errorCount++;
      }
    }

    console.log('\n=== Migration Complete ===');
    console.log(`✅ Updated: ${updatedCount} accounts`);
    console.log(`⏭️  Skipped: ${skippedCount} accounts (already had contact info)`);
    console.log(`❌ Errors: ${errorCount} accounts`);
    console.log('\nNOTE: Original contact records have been preserved for rollback safety.');
    console.log('You can verify the migration by checking the accounts table.\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if this file is executed directly
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  migrateContactsToAccounts()
    .then(() => {
      console.log('Migration script finished successfully.');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration script failed:', error);
      process.exit(1);
    });
}

export { migrateContactsToAccounts };
