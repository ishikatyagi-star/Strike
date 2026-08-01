// The 3s poll loop (Doc 3 §3). Runs in the Next.js Node runtime, started once from
// instrumentation.ts. Leader lease is hygiene; the trigger CAS is the real single-fire lock.
import { eq } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { wavelengthAdapter } from "./adapter";
import { recordSnapshot } from "./snapshots";
import { evaluateAndTrigger, type TriggerOutcome } from "./trigger";
import { acquireOrRenew } from "./lease";
import { executeExecution } from "@/lib/executor/execute";
import { sweepExpiredMandates } from "./expiry";

const TICK_MS = 3000;

export interface TickResult {
  leader: boolean;
  armed: number;
  fired: { mandate: string; price_cents: number; outcome: TriggerOutcome }[];
}

export async function runTickOnce(): Promise<TickResult> {
  if (!acquireOrRenew()) return { leader: false, armed: 0, fired: [] };
  sweepExpiredMandates(); // guarded per-row transitions; never a bulk status update (Doc 4 §5)
  const db = strikeDb();
  const now = new Date().toISOString();
  const armed = db.select().from(mandates).where(eq(mandates.status, "armed")).all();
  const fired: TickResult["fired"] = [];
  for (const m of armed) {
    if (m.validUntil <= now || m.validFrom > now) continue; // out of window; sweeper handles expiry (M6)
    const obs = await wavelengthAdapter.observe(m.itemSku);
    if (!obs) continue;
    const snap = recordSnapshot(m.merchantId, m.itemSku, obs);
    const condition = JSON.parse(m.conditionJson) as { type?: string; price_cents?: number };
    // Beat 5 must be user-triggered, not a race with the ordinary executor. In demo mode only,
    // retain an over-cap mandate in armed state once its price condition is true; the detail UI
    // then calls /demo-decline, which enters the same trigger + gated executor path with only the
    // app-layer cap check bypassed. Production watcher behavior is unaffected.
    const holdsForDeclineProof = process.env.DEMO === "1"
      && condition.type === "price_below"
      && typeof condition.price_cents === "number"
      && m.maxTotalCents < condition.price_cents;
    if (holdsForDeclineProof) {
      fired.push({ mandate: m.id, price_cents: obs.price_cents, outcome: "no_match" });
      continue;
    }
    const { outcome, executionId } = evaluateAndTrigger({ id: m.id, conditionJson: m.conditionJson, quantity: m.quantity }, snap);
    fired.push({ mandate: m.id, price_cents: obs.price_cents, outcome });
    if (outcome === "triggered" && executionId) {
      void executeExecution(executionId).catch(() => {}); // hand off to the spend path (Doc 3 §4)
    }
  }
  return { leader: true, armed: armed.length, fired };
}

const g = globalThis as unknown as { __watcher?: ReturnType<typeof setInterval> };

export function startWatcher() {
  if (g.__watcher) return; // survive hot reload — one interval per process
  g.__watcher = setInterval(() => {
    runTickOnce().catch(() => {});
  }, TICK_MS);
}
