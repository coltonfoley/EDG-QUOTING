// Test script to verify the fix
import { storage } from './server/storage';

async function testAccountsFix() {
  try {
    console.log('Testing getAllAccounts after fix...\n');
    const accounts = await storage.getAllAccounts();
    
    console.log(`Total accounts: ${accounts.length}\n`);
    console.log('Account Name | Contact Count | Project Count');
    console.log('-------------|---------------|---------------');
    
    accounts.forEach(acc => {
      const name = acc.name.padEnd(20);
      const contactCount = String(acc.contactCount).padEnd(13);
      const projectCount = String(acc.projectCount);
      console.log(`${name} | ${contactCount} | ${projectCount}`);
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit(0);
  }
}

testAccountsFix();
