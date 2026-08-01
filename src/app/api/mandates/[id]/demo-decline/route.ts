// Beat 5 only. This proves that an intentionally compromised app cannot exceed the mandate cap:
// it follows the normal condition -> execution -> spend-gate path, skipping ONLY our cap check
// under DEMO=1. Prava remains the final enforcement layer and supplies the real refusal.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { executeExecution } from "@/lib/executor/execute";
import { wavelengthAdapter } from "@/lib/watcher/adapter";
import { recordSnapshot } from "@/lib/watcher/snapshots";
import { evaluateAndTrigger } from "@/lib/watcher/trigger";

function error(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (process.env.DEMO !== "1") return error("DEMO_ONLY", "the network-refusal demo is disabled", 404);

  const { id } = await params;
  const mandate = strikeDb().select().from(mandates).where(eq(mandates.id, id)).get();
  if (!mandate) return error("NOT_FOUND", "no such mandate", 404);
  if (mandate.status !== "armed") return error("NOT_EXECUTABLE", `mandate is ${mandate.status}, expected armed`, 409);

  const observation = await wavelengthAdapter.observe(mandate.itemSku);
  if (!observation) return error("PRICE_UNAVAILABLE", "could not get a live price", 502);
  const snapshot = recordSnapshot(mandate.merchantId, mandate.itemSku, observation);
  const trigger = evaluateAndTrigger(
    { id: mandate.id, conditionJson: mandate.conditionJson, quantity: mandate.quantity },
    snapshot,
  );
  if (trigger.outcome === "no_match") {
    return error("CONDITION_NOT_MET", "the live price has not met this mandate's trigger", 409);
  }
  if (trigger.outcome !== "triggered" || !trigger.executionId) {
    return error("NOT_EXECUTABLE", "another execution claimed this mandate", 409);
  }

  // This is the sole M6 exception. executeExecution always re-verifies the passkey signature,
  // status, expiry, and stock in the same call stack immediately before chargeMandate().
  const result = await executeExecution(trigger.executionId, { bypassCap: true });
  return NextResponse.json({ execution_id: trigger.executionId, result });
}
