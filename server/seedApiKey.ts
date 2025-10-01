import { randomBytes } from 'crypto';
import { storage } from './storage';
import { hashApiKey } from './replitAuth';
import { db } from './db';

async function generateApiKey() {
  try {
    console.log('\n🔑 Generating API Key for Internal App...\n');
    
    // Generate a secure random API key (32 bytes = 64 hex characters)
    const apiKey = randomBytes(32).toString('hex');
    
    // Hash the key for storage
    const keyHash = hashApiKey(apiKey);
    
    // Insert into database
    const newKey = await storage.createApiKey({
      name: 'Internal App',
      keyHash: keyHash
    });
    
    console.log('✅ API Key created successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('⚠️  IMPORTANT: Save this API key - it will not be shown again!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('API Key ID:', newKey.id);
    console.log('API Key Name:', newKey.name);
    console.log('\nYour API Key:\n');
    console.log(`  ${apiKey}\n`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('Usage: Include this key in your internal app requests:');
    console.log(`  Authorization: Bearer ${apiKey}\n`);
    
  } catch (error) {
    console.error('❌ Error generating API key:', error);
    process.exit(1);
  } finally {
    // Close the database connection
    await db.$client.end();
    process.exit(0);
  }
}

generateApiKey();
