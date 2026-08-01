// Wavelength's public catalogue. It lets an operator-facing simulator show the merchant context
// without giving Strike direct access to store.db (Doc 3 trust boundary).
import { NextResponse } from "next/server";
import { listProducts, SEED_PRODUCT, SEED_PRODUCTS } from "@/lib/store/wavelength";

export async function GET() {
  const stickerBySku = new Map<string, number>(SEED_PRODUCTS.map((product) => [product.sku, product.priceCents]));
  const categoryBySku = new Map<string, string>(SEED_PRODUCTS.map((product) => [product.sku, product.category]));
  return NextResponse.json(listProducts().map((product) => ({
    sku: product.sku,
    name: product.name,
    image_url: product.imageUrl,
    price_cents: product.priceCents,
    sticker_cents: stickerBySku.get(product.sku) ?? product.priceCents,
    category: categoryBySku.get(product.sku) ?? "Catalog preview",
    in_stock: product.inStock,
    verified_checkout: product.sku === SEED_PRODUCT.sku,
  })));
}
