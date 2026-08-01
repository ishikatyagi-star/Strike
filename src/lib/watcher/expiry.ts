// The expiry sweeper (Doc 2 §4 row 10). Each mandate is transitioned and audited in its own
// transaction: audit_events is the system of record, never best-effort telemetry.
import { and, eq, lte } from "drizzle-orm";
import { strikeDb, strikeSqlite } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { appendEvent } from "@/lib/audit";

/** Expire due armed mandates. Returns the number whose guarded transition won. */
export function sweepExpiredMandates(now = new Date().toISOString()): number {
  const due = strikeDb()
    .select({ id: mandates.id })
    .from(mandates)
    .where(and(eq(mandates.status, "armed"), lte(mandates.validUntil, now)))
    .all();
  const sqlite = strikeSqlite();
  let expired = 0;

  for (const row of due) {
    sqlite.transaction(() => {
      const moved = sqlite
        .prepare("UPDATE mandates SET status='expired', resolved_at=? WHERE id=? AND status='armed' AND valid_until<=?")
        .run(now, row.id, now);
      if (moved.changes !== 1) return;
      appendEvent(
        {
          mandateId: row.id,
          eventType: "MANDATE_EXPIRED",
          actor: "system",
          payload: { expired_at: now },
        },
        sqlite,
      );
      expired += 1;
    })();
  }
  return expired;
}
