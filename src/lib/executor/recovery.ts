// Boot recovery (Doc 3 §4, Doc 1 criterion 6). Runs before the watcher starts. Resumes any
// mandate left mid-flight: executeExecution is idempotent end-to-end (same charge `reference`,
// same checkout `Idempotency-Key`), so a kill -9 at any line resumes without a duplicate fire.
import { inArray } from "drizzle-orm";
import { strikeDb, strikeSqlite } from "@/db/client";
import { mandates, executions } from "@/db/strike-schema";
import { appendEvent } from "@/lib/audit";
import { executeExecution } from "./execute";

export async function recoverInFlight() {
  const db = strikeDb();
  const stuck = db.select().from(mandates).where(inArray(mandates.status, ["triggered", "executing"])).all();
  for (const m of stuck) {
    const ex = db.select().from(executions).where(inArray(executions.mandateId, [m.id])).get();
    if (!ex) {
      strikeSqlite().prepare("UPDATE mandates SET status='armed' WHERE id=? AND status IN ('triggered','executing')").run(m.id);
      continue;
    }
    appendEvent(
      {
        mandateId: m.id,
        executionId: ex.id,
        eventType: "RECOVERY_ACTION",
        actor: "system",
        payload: { resuming: ex.id, prava_charged: Boolean(ex.pravaSessionId), checkout_submitted: Boolean(ex.checkoutSubmittedAt), order: ex.storeOrderId ?? null },
      },
      strikeSqlite(),
    );
    try {
      await executeExecution(ex.id);
    } catch {
      /* failure is audited; left for the next boot */
    }
  }
  return { recovered: stuck.length };
}
