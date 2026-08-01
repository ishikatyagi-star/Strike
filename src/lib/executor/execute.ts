// The executor (Doc 3 §4). The ONLY caller of chargeMandate + /store/api/checkout, and every path
// through here passes the spend gate first (Convention #1). execution_id is the end-to-end
// idempotency key: the Prava charge `reference` and the checkout `Idempotency-Key` (crash-safe).
import { eq } from "drizzle-orm";
import { strikeDb, strikeSqlite } from "@/db/client";
import { mandates, executions } from "@/db/strike-schema";
import { appendEvent } from "@/lib/audit";
import { verifyMandateForExecution, type GateReason } from "./gate";
import { chargeMandate, reportMandateCharge, PravaError } from "@/lib/prava";

const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";
type MandateRow = typeof mandates.$inferSelect;

async function liveQuote(sku: string, quantity: number): Promise<{ total_cents: number; in_stock: boolean } | null> {
  const res = await fetch(`${APP_ORIGIN}/store/api/quote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sku, quantity }),
    cache: "no-store",
  });
  if (res.ok) return { total_cents: (await res.json()).total_cents as number, in_stock: true };
  const j = await res.json().catch(() => ({}));
  if (j?.error?.code === "OUT_OF_STOCK") return { total_cents: 0, in_stock: false };
  return null; // transient — leave the row executing; recovery retries
}

export interface ExecuteResult {
  ok: boolean;
  outcome?: string;
  reason?: string;
  order_id?: string;
  amount_cents?: number;
  token_last4?: string;
  error?: string;
}

export async function executeExecution(executionId: string, opts: { bypassCap?: boolean } = {}): Promise<ExecuteResult> {
  const db = strikeDb();
  const sqlite = strikeSqlite();
  const ex = db.select().from(executions).where(eq(executions.id, executionId)).get();
  if (!ex) return { ok: false, error: "no such execution" };
  const m = db.select().from(mandates).where(eq(mandates.id, ex.mandateId)).get();
  if (!m) return { ok: false, error: "no mandate" };

  // recovery fast-path: checkout already recorded (crash before finalize) → just finalize (Doc 3 §4)
  if (ex.storeOrderId && (m.status === "executing" || m.status === "triggered")) {
    return finalize(m, executionId, ex.storeOrderId, ex.quoteTotalCents ?? 0, ex.pravaSessionId ?? undefined, null);
  }

  // claim: triggered -> executing (idempotent — resume if already executing)
  if (m.status === "triggered") {
    const claim = sqlite.prepare("UPDATE mandates SET status='executing' WHERE id=? AND status='triggered'").run(m.id);
    if (claim.changes !== 1) return { ok: false, error: "claim lost" };
    appendEvent({ mandateId: m.id, executionId, eventType: "EXECUTION_STARTED", actor: "executor", payload: { execution_id: executionId } }, sqlite);
    m.status = "executing";
  } else if (m.status !== "executing") {
    return { ok: false, error: `mandate status ${m.status}` };
  }

  const quote = await liveQuote(m.itemSku, m.quantity);
  if (!quote) return { ok: false, error: "quote unavailable (transient)" };

  // ==== THE SPEND GATE — the only path to Prava (Doc 2 §3.4) ====
  const gate = await verifyMandateForExecution(m, quote, { bypassCap: opts.bypassCap });
  if (!gate.ok) return settleGateFailure(m, executionId, gate.reason!, gate.detail, quote.total_cents);

  if (!m.pravaMandateId) return fail(m, executionId, "no_prava_mandate", "mandate not armed on Prava");

  // ==== LINE P — headless charge, same call stack as the gate ====
  let charge;
  try {
    charge = await chargeMandate({ mandateId: m.pravaMandateId, amountCents: quote.total_cents, reference: executionId });
  } catch (e) {
    const code = e instanceof PravaError ? e.code : "PRAVA_ERROR";
    return fail(m, executionId, "prava_declined", `${code}: ${(e as Error).message}`);
  }
  sqlite.prepare("UPDATE executions SET prava_session_id=?, updated_at=? WHERE id=?").run(charge.transactionId ?? null, new Date().toISOString(), executionId);
  appendEvent(
    { mandateId: m.id, executionId, eventType: "PRAVA_CALL", actor: "prava", payload: { op: "mandate_charge", status: charge.status, fetch_status: charge.fetchStatus ?? null, transaction_id: charge.transactionId ?? null, deduplicated: charge.deduplicated ?? null, error: charge.errorMessage ?? null } },
    sqlite,
  );
  if (charge.status === "failed" || !charge.credentials) {
    return fail(m, executionId, "prava_declined", charge.errorMessage ?? "charge failed", charge.transactionId); // e.g. THRESHOLD_EXCEEDED (Beat 5)
  }

  // A revoke which lands after Line P but before Line C wins. The minted credential remains only
  // in this stack frame and is never sent to the merchant; report the unused charge as DECLINED.
  const current = db.select({ status: mandates.status }).from(mandates).where(eq(mandates.id, m.id)).get();
  if (current?.status === "revoked") {
    await reportSafe(m.pravaMandateId, charge.transactionId, "DECLINED");
    return { ok: false, outcome: "revoked", reason: "user_revoked" };
  }

  // ==== LINE C — checkout with the single-use credentials (memory only, never persisted) ====
  const creds = charge.credentials;
  const checkoutRes = await fetch(`${APP_ORIGIN}/store/api/checkout`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Idempotency-Key": executionId },
    body: JSON.stringify({ sku: m.itemSku, quantity: m.quantity, amount_cents: quote.total_cents, card: { pan: creds.token, cvv: creds.dynamicCvv, expiry: `${creds.expiryMonth}/${creds.expiryYear}` } }),
    cache: "no-store",
  });
  const checkout = await checkoutRes.json().catch(() => ({}));
  sqlite.prepare("UPDATE executions SET checkout_submitted_at=?, updated_at=? WHERE id=?").run(new Date().toISOString(), new Date().toISOString(), executionId);
  if (!checkoutRes.ok || checkout?.error) {
    await reportSafe(m.pravaMandateId, charge.transactionId, "DECLINED");
    return fail(m, executionId, "checkout_declined", checkout?.error?.code ?? `http ${checkoutRes.status}`, charge.transactionId);
  }

  // ==== report APPROVED + FULFILLED ====
  sqlite.prepare("UPDATE executions SET store_order_id=?, updated_at=? WHERE id=?").run(checkout.order_id, new Date().toISOString(), executionId);
  return finalize(m, executionId, checkout.order_id, quote.total_cents, charge.transactionId, creds.token.slice(-4));
}

// executing -> fulfilled: report APPROVED (best-effort) + mark + audit, in one transaction.
function finalize(m: MandateRow, executionId: string, orderId: string, amountCents: number, pravaTxn: string | undefined, last4: string | null): ExecuteResult {
  const sqlite = strikeSqlite();
  const now = new Date().toISOString();
  if (m.pravaMandateId && pravaTxn) void reportSafe(m.pravaMandateId, pravaTxn, "APPROVED");
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE mandates SET status='fulfilled', resolved_at=? WHERE id=? AND status IN ('executing','triggered')").run(now, m.id);
    sqlite.prepare("UPDATE executions SET outcome='fulfilled', updated_at=? WHERE id=?").run(now, executionId);
    appendEvent({ mandateId: m.id, executionId, eventType: "EXECUTION_FULFILLED", actor: "executor", payload: { order_id: orderId, amount_cents: amountCents, token_last4: last4, prava_transaction_id: pravaTxn ?? null } }, sqlite);
  })();
  return { ok: true, outcome: "fulfilled", order_id: orderId, amount_cents: amountCents, token_last4: last4 ?? undefined };
}

// Before Line P: bad_signature → fail+alert; expired → expired; out_of_stock/over_cap → re-arm (Doc 2 §5).
function settleGateFailure(m: MandateRow, executionId: string, reason: GateReason, detail: string | undefined, observedCents: number): ExecuteResult {
  if (reason === "bad_signature") return fail(m, executionId, "bad_signature", detail ?? "signature re-verify failed", undefined, true);
  if (reason === "not_executable") return fail(m, executionId, "not_executable", detail);
  if (reason === "expired") {
    const now = new Date().toISOString();
    strikeSqlite().transaction(() => {
      strikeSqlite().prepare("UPDATE mandates SET status='expired', resolved_at=? WHERE id=? AND status='executing'").run(now, m.id);
      strikeSqlite().prepare("UPDATE executions SET outcome='failed', failure_reason='expired', updated_at=? WHERE id=?").run(now, executionId);
      appendEvent({ mandateId: m.id, executionId, eventType: "MANDATE_EXPIRED", actor: "executor", payload: { reason: "expired_before_charge" } }, strikeSqlite());
    })();
    return { ok: false, outcome: "expired", reason };
  }
  // out_of_stock | quote_exceeds_cap → re-arm and keep watching (row 8)
  strikeSqlite().transaction(() => {
    appendEvent({ mandateId: m.id, executionId, eventType: "EXECUTION_ABORTED", actor: "executor", payload: { reason, detail: detail ?? null, observed_quote_cents: observedCents } }, strikeSqlite());
    strikeSqlite().prepare("DELETE FROM executions WHERE id=?").run(executionId); // release the single-fire lock so it can re-trigger
    strikeSqlite().prepare("UPDATE mandates SET status='armed' WHERE id=? AND status='executing'").run(m.id);
  })();
  return { ok: false, outcome: "aborted_rearmed", reason };
}

// Payment-stage hard failure — terminal, needs a human (Doc 2 §5). No auto-retry.
function fail(m: MandateRow, executionId: string, reason: string, detail?: string, pravaTxn?: string, alert = false): ExecuteResult {
  const now = new Date().toISOString();
  const sqlite = strikeSqlite();
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE mandates SET status='failed', resolved_at=? WHERE id=? AND status IN ('executing','triggered')").run(now, m.id);
    sqlite.prepare("UPDATE executions SET outcome='failed', failure_reason=?, updated_at=? WHERE id=?").run(`${reason}${detail ? ": " + detail : ""}`, now, executionId);
    appendEvent({ mandateId: m.id, executionId, eventType: "EXECUTION_FAILED", actor: "executor", payload: { reason, detail: detail ?? null, prava_transaction_id: pravaTxn ?? null, alert } }, sqlite);
  })();
  return { ok: false, outcome: "failed", reason };
}

async function reportSafe(pravaMandateId: string, transactionId: string | undefined, status: "APPROVED" | "DECLINED") {
  if (!transactionId) return;
  try {
    await reportMandateCharge({ mandateId: pravaMandateId, transactionId, status });
  } catch {
    /* fire-and-retry: a failed report never blocks the order (Doc 3 §6) */
  }
}
