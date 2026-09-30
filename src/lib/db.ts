import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, process.env.SIDFAST_DB || "sidfast.db");

export type Args = Record<string, unknown> | unknown[];

type Sqlite = import("better-sqlite3").Database;
type Libsql = import("@libsql/client").Client;

let sqlite: Sqlite | null = null;
let libsql: Libsql | null = null;
let ready: Promise<void> | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS websites (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  share_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS website_members (
  website_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  PRIMARY KEY (website_id, user_id)
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS funnels (
  id TEXT PRIMARY KEY,
  website_id TEXT NOT NULL,
  name TEXT NOT NULL,
  steps TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  external_id TEXT NOT NULL,
  status TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'pro',
  current_period_end INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS integrations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  website_id TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  refresh_token TEXT NOT NULL DEFAULT '',
  expires_at INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  UNIQUE (user_id, provider, website_id)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  website_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL DEFAULT '/',
  title TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  referrer_source TEXT NOT NULL DEFAULT '',
  utm_source TEXT NOT NULL DEFAULT '',
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  utm_content TEXT NOT NULL DEFAULT '',
  goal_name TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  region TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  browser TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  screen TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  customer_email TEXT NOT NULL DEFAULT '',
  first_source TEXT NOT NULL DEFAULT '',
  first_referrer TEXT NOT NULL DEFAULT '',
  first_campaign TEXT NOT NULL DEFAULT '',
  last_source TEXT NOT NULL DEFAULT '',
  last_referrer TEXT NOT NULL DEFAULT '',
  metadata TEXT NOT NULL DEFAULT '',
  is_bot INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_events_site_time ON events (website_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_site_type_time ON events (website_id, type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_site_visitor ON events (website_id, visitor_id);
CREATE INDEX IF NOT EXISTS idx_events_visitor_time ON events (visitor_id, created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_websites_owner ON websites (owner_id);
`;

const MIGRATIONS = [
  "ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'",
  "ALTER TABLE users ADD COLUMN stripe_customer_id TEXT NOT NULL DEFAULT ''",
];

export function isRemote(): boolean {
  return !!process.env.TURSO_DATABASE_URL;
}

/**
 * Legacy rows stored session / reset tokens in the clear. Hash them once at
 * boot so a leaked database can no longer be replayed as live credentials.
 * Runs inside init() with the raw driver — the shared helpers would re-enter
 * boot() and deadlock.
 */
async function hardenAuthTokens(): Promise<void> {
  const sha = (v: string) => createHash("sha256").update(v).digest("hex");
  for (const table of ["sessions", "password_resets"]) {
    let rows: { token: string }[] = [];
    if (libsql) {
      const res = await libsql.execute(
        `SELECT token FROM ${table} WHERE token NOT LIKE 'sha256:%'`,
      );
      rows = res.rows as unknown as { token: string }[];
    } else if (sqlite) {
      rows = sqlite
        .prepare(`SELECT token FROM ${table} WHERE token NOT LIKE 'sha256:%'`)
        .all() as { token: string }[];
    }
    for (const row of rows) {
      const hashed = `sha256:${sha(row.token)}`;
      if (libsql)
        await libsql.execute({
          sql: `UPDATE ${table} SET token = ? WHERE token = ?`,
          args: [hashed, row.token],
        });
      else
        sqlite!
          .prepare(`UPDATE ${table} SET token = ? WHERE token = ?`)
          .run(hashed, row.token);
    }
  }
}

/**
 * One round trip decides whether the remote database is already migrated.
 * Skipping DDL, failed ALTERs and the token sweep saves ~400ms on every cold
 * start of a serverless instance.
 */
const SCHEMA_PROBE = `SELECT
  (SELECT COUNT(*) FROM pragma_table_info('users')
     WHERE name IN ('plan','stripe_customer_id')) AS cols,
  (SELECT COUNT(*) FROM pragma_table_info('rate_limits')) AS rl,
  (SELECT COUNT(*) FROM sessions WHERE token NOT LIKE 'sha256:%') AS s,
  (SELECT COUNT(*) FROM password_resets WHERE token NOT LIKE 'sha256:%') AS p`;

async function ensureRemoteSchema(): Promise<void> {
  try {
    const res = await libsql!.execute(SCHEMA_PROBE);
    const row = res.rows[0] as unknown as {
      cols: number;
      rl: number;
      s: number;
      p: number;
    };
    const current = Number(row.cols) === 2 && Number(row.rl) > 0;
    const legacyTokens = Number(row.s) + Number(row.p) > 0;
    if (current) {
      if (legacyTokens) await hardenAuthTokens();
      return;
    }
  } catch {
    /* tables missing or probe unsupported — fall through to full schema */
  }
  await libsql!.executeMultiple(SCHEMA);
  for (const m of MIGRATIONS) {
    try {
      await libsql!.execute(m);
    } catch {
      /* column already exists */
    }
  }
  await hardenAuthTokens();
}

async function init(): Promise<void> {
  if (isRemote()) {
    const { createClient } = await import("@libsql/client");
    libsql = createClient({
      url: process.env.TURSO_DATABASE_URL!,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
    await ensureRemoteSchema();
    return;
  }

  const Database = (await import("better-sqlite3")).default;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.exec(SCHEMA);
  for (const m of MIGRATIONS) {
    try {
      sqlite.exec(m);
    } catch {
      /* column already exists */
    }
  }
  await hardenAuthTokens();
}

let bootMs = 0;
/** Monotonic — never reset. Per-request numbers are deltas from a start snapshot. */
const counters = { stmts: 0, flushes: 0, dbMs: 0 };

export type DbSnapshot = typeof counters & { bootMs: number };

/**
 * Copy of the counters (with no argument), or the delta since a snapshot.
 * Counters are global, so under concurrent requests a delta may include
 * another request's statements — batch flushes are microtask-deferred, so in
 * practice a statement lands inside the window of the request that issued it.
 */
export function dbTiming(since?: DbSnapshot): DbSnapshot {
  if (!since) return { ...counters, bootMs };
  return {
    stmts: counters.stmts - since.stmts,
    flushes: counters.flushes - since.flushes,
    dbMs: counters.dbMs - since.dbMs,
    bootMs,
  };
}

function boot(): Promise<void> {
  if (!ready) {
    const t0 = Date.now();
    ready = init().then(() => {
      bootMs = Date.now() - t0;
    });
  }
  return ready;
}

/**
 * Remote queries are issued over HTTP, and each round trip costs a TLS
 * handshake plus Turso latency — that dwarfs the query itself. Statements that
 * are kicked off in the same tick (the `Promise.all` calls in stats/pages) are
 * therefore collected and sent as a single `batch()` instead of N requests.
 * A failing batch is replayed one statement at a time so a single bad
 * statement only rejects its own promise.
 */
type Pending = {
  stmt: import("@libsql/client").InStatement;
  resolve: (v: import("@libsql/client").ResultSet) => void;
  reject: (e: unknown) => void;
};

let queue: Pending[] = [];
let scheduled = false;

function enqueue(
  stmt: import("@libsql/client").InStatement,
): Promise<import("@libsql/client").ResultSet> {
  const promise = new Promise<import("@libsql/client").ResultSet>(
    (resolve, reject) => queue.push({ stmt, resolve, reject }),
  );
  if (!scheduled) {
    scheduled = true;
    queueMicrotask(flush);
  }
  return promise;
}

async function flush(): Promise<void> {
  const batch = queue;
  queue = [];
  scheduled = false;
  if (!batch.length) return;
  await boot();
  counters.stmts += batch.length;
  counters.flushes += 1;
  const t0 = Date.now();
  if (libsql) {
    try {
      const results = await libsql.batch(
        batch.map((p) => p.stmt),
        "deferred",
      );
      counters.dbMs += Date.now() - t0;
      for (let i = 0; i < results.length; i++) batch[i].resolve(results[i]);
      return;
    } catch {
      counters.stmts -= batch.length;
      counters.flushes -= 1;
      for (const p of batch) {
        try {
          const t = Date.now();
          p.resolve(await libsql.execute(p.stmt));
          counters.dbMs += Date.now() - t;
          counters.stmts += 1;
          counters.flushes += 1;
        } catch (e) {
          p.reject(e);
        }
      }
      counters.dbMs += Date.now() - t0;
      return;
    }
  }
  for (const p of batch) {
    p.reject(new Error("db: queued statements without a remote client"));
  }
}

function unwrapRows(result: { rows: unknown[] }): unknown[] {
  return result.rows as unknown[];
}

export async function all<T = Record<string, unknown>>(
  sql: string,
  args?: Args,
): Promise<T[]> {
  await boot();
  if (libsql) {
    const res = await enqueue(
      args === undefined ? { sql } : { sql, args: args as never },
    );
    return unwrapRows(res) as T[];
  }
  const stmt = sqlite!.prepare(sql);
  return (args === undefined ? stmt.all() : stmt.all(args as never)) as T[];
}

export async function get<T = Record<string, unknown>>(
  sql: string,
  args?: Args,
): Promise<T | undefined> {
  await boot();
  if (libsql) {
    const res = await enqueue(
      args === undefined ? { sql } : { sql, args: args as never },
    );
    const rows = unwrapRows(res);
    return (rows[0] as T) ?? undefined;
  }
  const stmt = sqlite!.prepare(sql);
  return (args === undefined ? stmt.get() : stmt.get(args as never)) as
    | T
    | undefined;
}

export async function run(sql: string, args?: Args): Promise<void> {
  await boot();
  if (libsql) {
    await enqueue(args === undefined ? { sql } : { sql, args: args as never });
    return;
  }
  const stmt = sqlite!.prepare(sql);
  if (args === undefined) stmt.run();
  else stmt.run(args as never);
}

export async function exec(sql: string): Promise<void> {
  await boot();
  if (libsql) {
    await libsql.executeMultiple(sql);
    return;
  }
  sqlite!.exec(sql);
}

/** Run many statements as one round trip (used by the demo seeder). */
export async function bulk(statements: string[]): Promise<void> {
  if (!statements.length) return;
  await boot();
  if (libsql) {
    await libsql.executeMultiple(statements.join(";\n"));
    return;
  }
  const tx = sqlite!.transaction(() => {
    for (const s of statements) sqlite!.prepare(s).run();
  });
  tx();
}
