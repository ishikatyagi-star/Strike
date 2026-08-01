// S3 detail feed (Doc 4 §3). Mandate + execution + full audit timeline + latest observed price.
// Audit payloads are redacted by construction (Never #3) — safe to surface. 2s-polled by the UI.
import { NextResponse } from "next/server";
import { eq, desc, and } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { mandates, executions, auditEvents, priceSnapshots } from "@/db/strike-schema";
import { hashOf } from "@/lib/mandate/signed-zone";
import { narrate } from "@/lib/llm/narrator";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = strikeDb();
  const m = db.select().from(mandates).where(eq(mandates.id, id)).get();
  if (!m) return NextResponse.json({ error: { code: "NOT_FOUND", message: "no such mandate" } }, { status: 404 });

  const ex = db.select().from(executions).where(eq(executions.mandateId, id)).get();
  const events = db.select().from(auditEvents).where(eq(auditEvents.mandateId, id)).orderBy(auditEvents.seq).all();
  const snap = db
    .select()
    .from(priceSnapshots)
    .where(and(eq(priceSnapshots.merchantId, m.merchantId), eq(priceSnapshots.sku, m.itemSku)))
    .orderBy(desc(priceSnapshots.observedAt), desc(priceSnapshots.id))
    .get();

  const narration = await narrate({
    status: m.status,
    item: m.itemDisplayName,
    latestPrice: snap?.priceCents,
    triggerCents: (JSON.parse(m.conditionJson) as { price_cents: number }).price_cents,
    amountCents: ex?.quoteTotalCents,
  });

  return NextResponse.json({
    mandate: {
      id: m.id,
      status: m.status,
      merchant: { id: m.merchantId, name: m.merchantName, country: m.merchantCountry },
      item: { sku: m.itemSku, display_name: m.itemDisplayName, image_url: m.itemImageUrl },
      condition: JSON.parse(m.conditionJson),
      max_total_cents: m.maxTotalCents,
      quantity: m.quantity,
      currency: m.currency,
      valid_from: m.validFrom,
      valid_until: m.validUntil,
      mandate_hash: hashOf(m),
      signed_at: m.signedAt,
      resolved_at: m.resolvedAt,
      armed_on_prava: Boolean(m.pravaMandateId),
      demo_decline_available: process.env.DEMO === "1",
    },
    execution: ex
      ? {
          id: ex.id,
          quote_total_cents: ex.quoteTotalCents,
          prava_transaction_id: ex.pravaSessionId,
          store_order_id: ex.storeOrderId,
          outcome: ex.outcome,
          failure_reason: ex.failureReason,
        }
      : null,
    latest_price: snap ? { price_cents: snap.priceCents, in_stock: Boolean(snap.inStock), observed_at: snap.observedAt } : null,
    events: events.map((e) => ({ seq: e.seq, event_type: e.eventType, actor: e.actor, payload: JSON.parse(e.payloadJson), created_at: e.createdAt })),
    narration,
  });
}
