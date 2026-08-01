import { NextResponse } from "next/server";
import { z } from "zod";
import { setPrice, getProduct } from "@/lib/store/wavelength";
import { storeError, isAdmin } from "@/lib/store/http";

// The lever (Doc 3 §7). Admin only.
const PriceReq = z.object({
  sku: z.string(),
  price_cents: z.number().int().positive(),
  in_stock: z.boolean().optional(),
});

export async function POST(req: Request) {
  if (!(await isAdmin())) return storeError("UNAUTHORIZED", "Admin only", 401);
  let body: z.infer<typeof PriceReq>;
  try {
    body = PriceReq.parse(await req.json());
  } catch {
    return storeError("VALIDATION_FAILED", "Invalid price request", 422);
  }
  if (!getProduct(body.sku)) return storeError("NOT_FOUND", "No such product", 404);
  const p = setPrice(body.sku, body.price_cents, body.in_stock)!;
  return NextResponse.json({ sku: p.sku, price_cents: p.priceCents, in_stock: p.inStock });
}
