import { existsSync } from "node:fs";
import path from "node:path";
import { randomBytes, scrypt } from "node:crypto";
import { promisify } from "node:util";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";

const scryptAsync = promisify(scrypt);

function loadEnv() {
  const projectRoot = process.cwd();
  const nodeEnv = process.env.NODE_ENV || "development";
  const envFiles = [
    process.env.ADMIN_ENV_FILE,
    ".env",
    `.env.${nodeEnv}`,
    ...(nodeEnv === "test" ? [] : [".env.local"]),
    `.env.${nodeEnv}.local`,
  ].filter(Boolean) as string[];

  for (const fileName of envFiles) {
    const filePath = path.resolve(projectRoot, fileName);
    if (existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
}

function cleanText(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function readBoolean(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

async function main() {
  loadEnv();

  const username = cleanText(process.env.ADMIN_USERNAME);
  const password = process.env.ADMIN_PASSWORD;
  const role = cleanText(process.env.ADMIN_ROLE) || "admin";
  const updatePassword = readBoolean(process.env.ADMIN_UPDATE_PASSWORD);

  if (!username) {
    throw new Error("ADMIN_USERNAME is required.");
  }

  if (!password || password.length < 12) {
    throw new Error("ADMIN_PASSWORD is required and must be at least 12 characters.");
  }

  if (!["admin", "user"].includes(role)) {
    throw new Error('ADMIN_ROLE must be "admin" or "user".');
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }

  const [{ db, pool }, { users }] = await Promise.all([
    import("../server/db"),
    import("../shared/schema"),
  ]);

  try {
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const profileValues: Partial<typeof users.$inferInsert> = {
      role,
      updatedAt: new Date(),
    };
    const email = cleanText(process.env.ADMIN_EMAIL);
    const firstName = cleanText(process.env.ADMIN_FIRST_NAME);
    const lastName = cleanText(process.env.ADMIN_LAST_NAME);

    if (email) profileValues.email = email;
    if (firstName) profileValues.firstName = firstName;
    if (lastName) profileValues.lastName = lastName;

    if (existingUser) {
      if (updatePassword) {
        profileValues.password = await hashPassword(password);
      }

      const [updatedUser] = await db
        .update(users)
        .set(profileValues)
        .where(eq(users.id, existingUser.id))
        .returning({
          id: users.id,
          username: users.username,
          role: users.role,
        });

      console.log(
        `Updated Rainmaker user ${updatedUser.username} (${updatedUser.role}) with id ${updatedUser.id}.`,
      );
      if (!updatePassword) {
        console.log("Password was left unchanged. Set ADMIN_UPDATE_PASSWORD=true to rotate it.");
      }
      return;
    }

    const insertValues: typeof users.$inferInsert = {
      username,
      password: await hashPassword(password),
      role,
      email,
      firstName,
      lastName,
    };

    const [createdUser] = await db
      .insert(users)
      .values(insertValues)
      .returning({
        id: users.id,
        username: users.username,
        role: users.role,
      });

    console.log(
      `Created Rainmaker user ${createdUser.username} (${createdUser.role}) with id ${createdUser.id}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(
    error instanceof Error
      ? error.message
      : "Database operation failed. Check DATABASE_URL and network access.",
  );
  process.exit(1);
});
