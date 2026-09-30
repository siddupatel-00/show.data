#!/usr/bin/env node
/**
 * One-way copy of the local SQLite database into Turso.
 *
 *   node scripts/migrate-sqlite-to-turso.mjs [path/to/local.db]
 *
 * Reads TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from the environment or
 * .env.local. Safe to re-run: rows are inserted with INSERT OR REPLACE, so a
 * second run overwrites rather than duplicates.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function loadEnvLocal() {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
loadEnvLocal();

const URL_ = process.env.TURSO_DATABASE_URL;
const TOKEN = process.env.TURSO_AUTH_TOKEN;
if (!URL_) {
  console.error("TURSO_DATABASE_URL is not set (checked env and .env.local)");
  process.exit(1);
}

const TABLES = [
  "users",
  "sessions",
  "password_resets",
  "rate_limits",
  "websites",
  "website_members",
  "goals",
  "funnels",
  "subscriptions",
  "integrations",
  "events",
];

const dbPath = process.argv[2] || path.join(process.cwd(), "data", "sidfast.db");
if (!fs.existsSync(dbPath)) {
  console.error(`local database not found: ${dbPath}`);
  process.exit(1);
}

const Database = require("better-sqlite3");
const { createClient } = require("@libsql/client");

const local = new Database(dbPath, { readonly: true });
const remote = createClient({ url: URL_, authToken: TOKEN });

// Make sure the target schema exists before copying into it.
const schema = fs.readFileSync(
  path.join(process.cwd(), "src", "lib", "db.ts"),
  "utf8",
);
const scMatch = schema.match(/const SCHEMA = `([\s\S]*?)`;/);
if (!scMatch) throw new Error("could not read SCHEMA out of src/lib/db.ts");
await remote.executeMultiple(scMatch[1]);

let total = 0;
for (const table of TABLES) {
  let cols;
  try {
    cols = local.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  } catch {
    continue;
  }
  if (!cols.length) continue;
  const rows = local.prepare(`SELECT * FROM ${table}`).all();
  if (!rows.length) {
    console.log(`${table.padEnd(18)} 0 rows`);
    continue;
  }
  const placeholders = cols.map(() => "?").join(", ");
  const sql = `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${placeholders})`;
  // libsql accepts one statement per execute; batch them in chunks of 50.
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    await remote.batch(
      chunk.map((row) => ({
        sql,
        args: cols.map((c) => row[c] ?? null),
      })),
      "write",
    );
  }
  total += rows.length;
  console.log(`${table.padEnd(18)} ${rows.length} rows`);
}

const check = await remote.execute("SELECT COUNT(*) AS c FROM events");
console.log(`\ncopied ${total} rows → Turso (${check.rows[0].c} events now there)`);
