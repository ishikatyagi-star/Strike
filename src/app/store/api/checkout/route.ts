import { NextResponse } from "next/server";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { storeDb } from "@/db/client";
import { orders } from "@/db/store-schema";
import { eq } from "drizzle-orm";
import { getProduct, luhnValid, expiryValid, last4 } from "@/lib/store/wavelength";
import { storeError } from "@/lib/store/http";

// Doc 4 §3. Idempotency-Key REQUIRED; duplicate key ⇒ 200 with the original order (crash-safe
// replay, Doc 3 §4). PAN/CVV are used in-memory only and NEVER stored/logged — last4 max (Never #3).
const CheckoutReq = z.object({
  sku: z.string(),
  quantity: z.number().int().positive(),
  amount_cents: z.number().int().positive(),
  card: z.object({ pan: z.string(), cvv: z.string(), expiry: z.string() }),
});

function orderResponse(o: { id: string; status: string; amountCents: number }, replayed = false) {
  return NextResponse.json({ order_id: o.id, status: o.status, amount_cents: o.amountCents, replayed });
}

export async function POST(req: Request) {
  const idem = req.headers.get("idempotency-key");
  if (!idem) return storeError("IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key header is required", 400);

  const db = storeDb();
  const prior = db.select().from(orders).where(eq(orders.idempotencyKey, idem)).get();
  if (prior) return orderResponse(prior, true);

  let body: z.infer<typeof CheckoutReq>;
  try {
    body = CheckoutReq.parse(await req.json());
  } catch {
    return storeError("VALIDATION_FAILED", "Invalid checkout request", 422);
  }

  const p = getProduct(body.sku);
  if (!p) return storeError("NOT_FOUND", "No such product", 404);
  if (!p.inStock) return storeError("OUT_OF_STOCK", "Item is not purchasable", 409);

  const liveTotal = p.priceCents * body.quantity;
  if (body.amount_cents !== liveTotal) {
    // merchant-overcharge guard (Doc 2 §5): the network would decline anyway, but we refuse early
    return storeError("AMOUNT_MISMATCH", `amount ${body.amount_cents} != live total ${liveTotal}`, 402);
  }
  if (!luhnValid(body.card.pan) || !expiryValid(body.card.expiry) || !/^\d{3,4}$/.test(body.card.cvv)) {
    return storeError("CARD_INVALID", "Card failed validation", 402);
  }

  const order = {
    id: randomUUID(),
    sku: body.sku,
    quantity: body.quantity,
    amountCents: body.amount_cents,
    cardLast4: last4(body.card.pan), // ONLY last4 persists
    idempotencyKey: idem,
    status: "captured" as const,
    createdAt: new Date().toISOString(),
  };
  try {
    db.insert(orders).values(order).run();
  } catch {
    // UNIQUE(idempotency_key) race: a concurrent request won — return the winner
    const won = db.select().from(orders).where(eq(orders.idempotencyKey, idem)).get();
    if (won) return orderResponse(won, true);
    return storeError("VALIDATION_FAILED", "Order could not be recorded", 500);
  }
  return orderResponse(order);
}
