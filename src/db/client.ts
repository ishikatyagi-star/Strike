// Two SQLite files, one hard rule: no query crosses them (Doc 4).
// DDL bootstrap is idempotent and mirrors the Drizzle schemas exactly;
// hand-written so the CHECK constraints + append-only trigger from Doc 4 exist verbatim.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as strikeSchema from "./strike-schema";
import * as storeSchema from "./store-schema";

const DATA_DIR = path.join(process.cwd(), "data");

const STRIKE_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webauthn_credentials (
  credential_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  public_key_cose BLOB NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS mandates (
  id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL DEFAULT 1,
  user_id TEXT NOT NULL REFERENCES users(id),
  credential_id TEXT NOT NULL REFERENCES webauthn_credentials(credential_id),
  merchant_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  merchant_url TEXT NOT NULL,
  merchant_country TEXT NOT NULL,
  item_sku TEXT NOT NULL,
  item_display_name TEXT NOT NULL,
  item_image_url TEXT NOT NULL,
  condition_json TEXT NOT NULL,
  max_total_cents INTEGER NOT NULL CHECK (max_total_cents > 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  currency TEXT NOT NULL CHECK (currency = 'USD'),
  valid_from TEXT NOT NULL,
  valid_until TEXT NOT NULL CHECK (valid_until > valid_from),
  mode TEXT NOT NULL CHECK (mode IN ('single_use')),
  nonce TEXT NOT NULL UNIQUE,
  nonce_consumed_at TEXT,
  status TEXT NOT NULL CHECK (status IN ('draft','signed','armed','triggered','executing','fulfilled','failed','expired','revoked','discarded')),
  signature BLOB,
  authenticator_data BLOB,
  client_data_json BLOB,
  signed_at TEXT,
  resolved_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS mandates_status_idx ON mandates(status);
CREATE INDEX IF NOT EXISTS mandates_status_valid_until_idx ON mandates(status, valid_until);
CREATE INDEX IF NOT EXISTS mandates_user_created_idx ON mandates(user_id, created_at);
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  mandate_id TEXT NOT NULL UNIQUE REFERENCES mandates(id),
  trigger_snapshot_id INTEGER REFERENCES price_snapshots(id),
  quote_total_cents INTEGER,
  prava_session_id TEXT,
  checkout_submitted_at TEXT,
  store_order_id TEXT,
  outcome TEXT CHECK (outcome IN ('fulfilled','aborted_rearmed','failed','revoked')),
  failure_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  mandate_id TEXT,
  execution_id TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN ('MANDATE_DRAFTED','MANDATE_SIGNED','MANDATE_DISCARDED','MANDATE_ARMED','CONDITION_TRIGGERED','EXECUTION_STARTED','EXECUTION_FULFILLED','EXECUTION_ABORTED','EXECUTION_FAILED','MANDATE_EXPIRED','MANDATE_REVOKED','PRAVA_CALL','RECOVERY_ACTION')),
  actor TEXT NOT NULL CHECK (actor IN ('user','llm','watcher','executor','system','prava')),
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_mandate_seq_idx ON audit_events(mandate_id, seq);
-- Doc 4 §1: audit_events is append-only, enforced mechanically. Never drop these.
CREATE TRIGGER IF NOT EXISTS audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN SELECT RAISE(ABORT, 'audit_events is append-only'); END;
CREATE TABLE IF NOT EXISTS price_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  in_stock INTEGER NOT NULL,
  source TEXT NOT NULL,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS snapshots_lookup_idx ON price_snapshots(merchant_id, sku, observed_at);
CREATE TABLE IF NOT EXISTS watcher_lease (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  holder TEXT NOT NULL,
  heartbeat_at TEXT NOT NULL
);
`;

const STORE_DDL = `
CREATE TABLE IF NOT EXISTS products (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents > 0),
  in_stock INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  sku TEXT NOT NULL REFERENCES products(sku),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  card_last4 TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('captured','declined')),
  created_at TEXT NOT NULL
);
`;

function open(file: string, ddl: string) {
  mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(path.join(DATA_DIR, file));
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(ddl);
  return sqlite;
}

// globalThis caching so Next.js hot reload doesn't leak handles
const g = globalThis as unknown as {
  __strikeDb?: ReturnType<typeof drizzle<typeof strikeSchema>>;
  __storeDb?: ReturnType<typeof drizzle<typeof storeSchema>>;
  __strikeSqlite?: Database.Database;
  __storeSqlite?: Database.Database;
};

export function strikeDb() {
  if (!g.__strikeDb) {
    g.__strikeSqlite = open("strike.db", STRIKE_DDL);
    g.__strikeDb = drizzle(g.__strikeSqlite, { schema: strikeSchema });
  }
  return g.__strikeDb;
}

export function storeDb() {
  if (!g.__storeDb) {
    g.__storeSqlite = open("store.db", STORE_DDL);
    g.__storeDb = drizzle(g.__storeSqlite, { schema: storeSchema });
  }
  return g.__storeDb;
}

/** Raw handle for transactions that must couple status change + audit event (Doc 2 §4). */
export function strikeSqlite() {
  strikeDb();
  return g.__strikeSqlite!;
}
