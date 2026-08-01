// Doc 4 §1 — strike.db. Column names/constraints are the contract; no synonyms.
import {
  sqliteTable,
  text,
  integer,
  blob,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const MANDATE_STATUSES = [
  "draft",
  "signed",
  "armed",
  "triggered",
  "executing",
  "fulfilled",
  "failed",
  "expired",
  "revoked",
  "discarded",
] as const;
export type MandateStatus = (typeof MANDATE_STATUSES)[number];

export const EVENT_TYPES = [
  "MANDATE_DRAFTED",
  "MANDATE_SIGNED",
  "MANDATE_DISCARDED",
  "MANDATE_ARMED",
  "CONDITION_TRIGGERED",
  "EXECUTION_STARTED",
  "EXECUTION_FULFILLED",
  "EXECUTION_ABORTED",
  "EXECUTION_FAILED",
  "MANDATE_EXPIRED",
  "MANDATE_REVOKED",
  "PRAVA_CALL",
  "RECOVERY_ACTION",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ACTORS = ["user", "llm", "watcher", "executor", "system", "prava"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: text("created_at").notNull(),
});

export const webauthnCredentials = sqliteTable("webauthn_credentials", {
  credentialId: text("credential_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  publicKeyCose: blob("public_key_cose").$type<Buffer>().notNull(),
  signCount: integer("sign_count").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const mandates = sqliteTable(
  "mandates",
  {
    id: text("id").primaryKey(),
    schemaVersion: integer("schema_version").notNull().default(1),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    credentialId: text("credential_id")
      .notNull()
      .references(() => webauthnCredentials.credentialId),
    merchantId: text("merchant_id").notNull(),
    merchantName: text("merchant_name").notNull(),
    merchantUrl: text("merchant_url").notNull(),
    merchantCountry: text("merchant_country").notNull(),
    itemSku: text("item_sku").notNull(),
    itemDisplayName: text("item_display_name").notNull(),
    itemImageUrl: text("item_image_url").notNull(),
    conditionJson: text("condition_json").notNull(),
    maxTotalCents: integer("max_total_cents").notNull(),
    quantity: integer("quantity").notNull(),
    currency: text("currency").notNull(),
    validFrom: text("valid_from").notNull(),
    validUntil: text("valid_until").notNull(),
    mode: text("mode").notNull(),
    nonce: text("nonce").notNull(),
    nonceConsumedAt: text("nonce_consumed_at"),
    status: text("status").$type<MandateStatus>().notNull(),
    signature: blob("signature"),
    authenticatorData: blob("authenticator_data"),
    clientDataJson: blob("client_data_json"),
    signedAt: text("signed_at"),
    resolvedAt: text("resolved_at"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [
    uniqueIndex("mandates_nonce_uq").on(t.nonce),
    index("mandates_status_idx").on(t.status),
    index("mandates_status_valid_until_idx").on(t.status, t.validUntil),
    index("mandates_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const executions = sqliteTable(
  "executions",
  {
    // execution id IS the end-to-end idempotency key (Doc 3 §4)
    id: text("id").primaryKey(),
    mandateId: text("mandate_id")
      .notNull()
      .references(() => mandates.id),
    triggerSnapshotId: integer("trigger_snapshot_id").references(() => priceSnapshots.id),
    quoteTotalCents: integer("quote_total_cents"),
    pravaSessionId: text("prava_session_id"), // Line P marker
    checkoutSubmittedAt: text("checkout_submitted_at"), // Line C marker
    storeOrderId: text("store_order_id"),
    outcome: text("outcome").$type<
      "fulfilled" | "aborted_rearmed" | "failed" | "revoked"
    >(),
    failureReason: text("failure_reason"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (t) => [uniqueIndex("executions_mandate_uq").on(t.mandateId)], // single-fire lock #2
);

export const auditEvents = sqliteTable(
  "audit_events",
  {
    seq: integer("seq").primaryKey({ autoIncrement: true }),
    mandateId: text("mandate_id"),
    executionId: text("execution_id"),
    eventType: text("event_type").$type<EventType>().notNull(),
    actor: text("actor").$type<(typeof ACTORS)[number]>().notNull(),
    payloadJson: text("payload_json").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [index("audit_mandate_seq_idx").on(t.mandateId, t.seq)],
);

export const priceSnapshots = sqliteTable(
  "price_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    merchantId: text("merchant_id").notNull(),
    sku: text("sku").notNull(),
    priceCents: integer("price_cents").notNull(),
    inStock: integer("in_stock", { mode: "boolean" }).notNull(),
    source: text("source").notNull(),
    observedAt: text("observed_at").notNull(),
  },
  (t) => [index("snapshots_lookup_idx").on(t.merchantId, t.sku, t.observedAt)],
);

export const watcherLease = sqliteTable("watcher_lease", {
  id: integer("id").primaryKey(), // CHECK (id = 1) enforced in DDL bootstrap
  holder: text("holder").notNull(),
  heartbeatAt: text("heartbeat_at").notNull(),
});
