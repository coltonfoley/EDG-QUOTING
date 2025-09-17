import { db } from "./db";
import { users } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function initializeAdminUser() {
  // Only run in development mode
  if (process.env.NODE_ENV === 'production' || process.env.REPL_ID) {
    console.log("⚠️ Admin initialization skipped in production mode.");
    process.exit(0);
  }
  
  try {
    // Check if admin user exists
    const [existingAdmin] = await db.select().from(users).where(eq(users.username, "admin"));
    
    if (existingAdmin) {
      // Update the password to 'admin123'
      const hashedPassword = await hashPassword("admin123");
      
      await db
        .update(users)
        .set({ 
          password: hashedPassword,
          updatedAt: new Date()
        })
        .where(eq(users.username, "admin"));
      
      console.log("✅ Admin user updated (development mode).");
    } else {
      // Create admin user if it doesn't exist
      const hashedPassword = await hashPassword("admin123");
      
      await db
        .insert(users)
        .values({
          username: "admin",
          password: hashedPassword,
          email: "admin@edgpatio.com",
          firstName: "Admin",
          lastName: "User",
          role: "admin"
        });
      
      console.log("✅ Admin user created (development mode).");
    }
    
    // Also update/create a test user for testing
    const [existingTestUser] = await db.select().from(users).where(eq(users.username, "testuser"));
    
    if (existingTestUser) {
      const hashedPassword = await hashPassword("test123");
      await db
        .update(users)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(eq(users.username, "testuser"));
      
      console.log("✅ Test user updated (development mode).");
    } else {
      const hashedPassword = await hashPassword("test123");
      await db
        .insert(users)
        .values({
          username: "testuser",
          password: hashedPassword,
          email: "testuser@example.com",
          firstName: "Test",
          lastName: "User",
          role: "user"
        });
      
      console.log("✅ Test user created (development mode).");
    }
    
  } catch (error) {
    console.error("❌ Error initializing admin user:", error);
  } finally {
    process.exit(0);
  }
}

// Run the initialization
initializeAdminUser();