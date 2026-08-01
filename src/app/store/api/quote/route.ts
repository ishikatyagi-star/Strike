import { NextResponse } from "next/server";
import { z } from "zod";
import { getProduct } from "@/lib/store/wavelength";
import { storeError } from "@/lib/store/http";

const QuoteReq = z.object({ sku: z.string(), quantity: z.number().int().positive() });

export async function POST(req: Request) {
  let body: z.infer<typeof QuoteReq>;
  try {
    body = QuoteReq.parse(await req.json());
  } catch {
    return storeError("VALIDATION_FAILED", "Invalid quote request", 422);
  }
  const p = getProduct(body.sku);
  if (!p) return storeError("NOT_FOUND", "No such product", 404);
  if (!p.inStock) return storeError("OUT_OF_STOCK", "Item is not purchasable", 409);
  // live price × qty; no tax/shipping in v1 (Doc 2 A3)
  return NextResponse.json({
    total_cents: p.priceCents * body.quantity,
    quoted_at: new Date().toISOString(),
  });
}
