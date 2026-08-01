import { NextResponse } from "next/server";
import { getProduct } from "@/lib/store/wavelength";
import { storeError } from "@/lib/store/http";

export async function GET(_req: Request, { params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const p = getProduct(sku);
  if (!p) return storeError("NOT_FOUND", "No such product", 404);
  return NextResponse.json({
    sku: p.sku,
    name: p.name,
    price_cents: p.priceCents,
    in_stock: p.inStock,
    image_url: p.imageUrl,
  });
}
