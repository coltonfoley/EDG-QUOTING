// Test script to check what getAllAccounts returns
import { storage } from './server/storage';

async function testAccounts() {
  try {
    console.log('Testing getAllAccounts method directly...\n');
    const accounts = await storage.getAllAccounts();
    
    console.log(`Total accounts: ${accounts.length}\n`);
    
    accounts.forEach(acc => {
      console.log(`Account: ${acc.name}`);
      console.log(`  ID: ${acc.id}`);
      console.log(`  Contact Count: ${acc.contactCount}`);
      console.log(`  Project Count: ${acc.projectCount}`);
      console.log('---');
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testAccounts();
