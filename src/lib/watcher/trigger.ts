// The trigger (Doc 2 §4 row 5, §5 duplicate-trigger). Two data-level locks, both in SQLite:
//   1. CAS  UPDATE ... WHERE status='armed'  → exactly one tick flips armed→triggered
//   2. INSERT executions with UNIQUE(mandate_id) → second lock even if (1) ever raced
// Firing does NOT spend — it only moves the state machine and records the snapshot (Doc 2 §2).
import { randomUUID } from "node:crypto";
import { strikeSqlite } from "@/db/client";
import { appendEvent } from "@/lib/audit";
import type { Snapshot } from "./snapshots";

export type TriggerOutcome = "triggered" | "no_match" | "lost_race";
export interface TriggerResult {
  outcome: TriggerOutcome;
  executionId?: string;
}

export function evaluateAndTrigger(
  mandate: { id: string; conditionJson: string; quantity: number },
  snapshot: Snapshot,
): TriggerResult {
  const cond = JSON.parse(mandate.conditionJson) as { type: string; price_cents: number };
  if (cond.type !== "price_below") return { outcome: "no_match" };
  if (!snapshot.in_stock || snapshot.price_cents >= cond.price_cents) return { outcome: "no_match" };

  const db = strikeSqlite();
  let outcome: TriggerOutcome = "lost_race";
  let triggeredExecId: string | undefined;
  db.transaction(() => {
    const cas = db.prepare("UPDATE mandates SET status='triggered' WHERE id=? AND status='armed'").run(mandate.id);
    if (cas.changes !== 1) {
      outcome = "lost_race"; // another tick won, or it isn't armed
      return;
    }
    const execId = randomUUID(); // the end-to-end idempotency key (Doc 3 §4)
    triggeredExecId = execId;
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO executions (id, mandate_id, trigger_snapshot_id, quote_total_cents, created_at, updated_at) VALUES (?,?,?,?,?,?)",
    ).run(execId, mandate.id, snapshot.id, snapshot.price_cents * mandate.quantity, now, now);
    appendEvent(
      {
        mandateId: mandate.id,
        executionId: execId,
        eventType: "CONDITION_TRIGGERED",
        actor: "watcher",
        payload: {
          execution_id: execId,
          snapshot: { source: snapshot.source, price_cents: snapshot.price_cents, in_stock: snapshot.in_stock, observed_at: snapshot.observed_at },
          quote_total_cents: snapshot.price_cents * mandate.quantity,
        },
      },
      db,
    );
    outcome = "triggered";
  })();
  return { outcome, executionId: triggeredExecId }; // triggeredExecId is set only on a winning CAS
}
