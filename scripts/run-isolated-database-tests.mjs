import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const root = process.cwd();
const migrationDirectory = resolve(root, "migrations");
const manifest = JSON.parse(
  readFileSync(resolve(migrationDirectory, "manifest.json"), "utf8"),
);

const database = await PGlite.create();
const server = new PGLiteSocketServer({
  db: database,
  host: "127.0.0.1",
  port: 0,
  maxConnections: 8,
});

async function run() {
  for (const migration of manifest.migrations) {
    const sql = readFileSync(resolve(migrationDirectory, migration), "utf8");
    try {
      await database.exec(sql);
    } catch (error) {
      throw new Error(`Failed to restore isolated database migration ${migration}`, { cause: error });
    }
  }

  await server.start();
  const testDatabaseUrl = `postgresql://postgres@${server.getServerConn()}/postgres?sslmode=disable`;
  const childEnvironment = { ...process.env };
  delete childEnvironment.DATABASE_URL;
  Object.assign(childEnvironment, {
    NODE_ENV: "test",
    TEST_DATABASE_URL: testDatabaseUrl,
    ALLOW_DATABASE_TEST_WRITES: "true",
    RAINMAKER_TEST_DATABASE_DRIVER: "node-postgres",
  });

  const vitestPath = resolve(root, "node_modules/vitest/vitest.mjs");
  const exitCode = await new Promise((resolveExit, reject) => {
    const child = spawn(process.execPath, [vitestPath, "run", "server/tests/quotes.test.ts"], {
      cwd: root,
      env: childEnvironment,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Database tests stopped by signal ${signal}`));
        return;
      }
      resolveExit(code ?? 1);
    });
  });

  if (exitCode !== 0) {
    throw new Error(`Database tests exited with code ${exitCode}`);
  }
}

try {
  await run();
} finally {
  await server.stop().catch(() => undefined);
  await database.close().catch(() => undefined);
}
