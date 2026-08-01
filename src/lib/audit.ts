// Append to the system of record (Doc 4 §1). Every status change writes its event in the SAME
// transaction as the change (Doc 2 §4) — pass the raw better-sqlite3 handle inside a transaction.
import type { Database } from "better-sqlite3";
import { strikeSqlite } from "@/db/client";
import type { EventType, ACTORS } from "@/db/strike-schema";

type Actor = (typeof ACTORS)[number];

export function appendEvent(
  opts: {
    mandateId?: string | null;
    executionId?: string | null;
    eventType: EventType;
    actor: Actor;
    payload: unknown;
  },
  db: Database = strikeSqlite(),
): void {
  db.prepare(
    `INSERT INTO audit_events (mandate_id, execution_id, event_type, actor, payload_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.mandateId ?? null,
    opts.executionId ?? null,
    opts.eventType,
    opts.actor,
    JSON.stringify(opts.payload),
    new Date().toISOString(),
  );
}
