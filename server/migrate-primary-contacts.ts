import { drizzle } from 'drizzle-orm/neon-serverless';
import { neonConfig, Pool } from '@neondatabase/serverless';
import { accounts, contacts } from '../shared/schema';
import { eq, and } from 'drizzle-orm';
import dotenv from 'dotenv';
import ws from 'ws';

dotenv.config();

neonConfig.webSocketConstructor = ws;

async function migrateContactsToAccounts() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);

  console.log('\n=== Starting Contact to Account Migration ===\n');
  console.log('This script will copy firstName and lastName from primary contacts into their parent accounts.');
  console.log('Original contact records will be preserved for rollback safety.\n');

  try {
    const primaryContacts = await db
      .select({
        contactId: contacts.id,
        contactFirstName: contacts.firstName,
        contactLastName: contacts.lastName,
        contactEmail: contacts.email,
        accountId: contacts.accountId,
        accountName: accounts.name,
        accountFirstName: accounts.firstName,
        accountLastName: accounts.lastName,
      })
      .from(contacts)
      .innerJoin(accounts, eq(contacts.accountId, accounts.id))
      .where(eq(contacts.isPrimary, true));

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
        await db
          .update(accounts)
          .set({
            firstName: contact.contactFirstName,
            lastName: contact.contactLastName,
          })
          .where(eq(accounts.id, contact.accountId));

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
