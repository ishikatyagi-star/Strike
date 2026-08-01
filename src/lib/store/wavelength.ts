// Wavelength — the mock merchant (Doc 1, Doc 4 §2, Doc 5 S5). Its own DB (store.db),
// reached by Strike ONLY over /store/api/* (Doc 3 §2 trust boundary). This is Wavelength's
// OWN server logic, so it may query store.db directly — Strike code must not.
import { storeDb } from "@/db/client";
import { products, orders } from "@/db/store-schema";
import { eq, desc } from "drizzle-orm";

// canonical merchant identity — must match what Strike pins into the Prava mandate (Doc 2 §7)
export const WAVELENGTH_MERCHANT = {
  id: "wavelength",
  name: "Wavelength",
  url: "https://wavelength.store",
  country: "US",
} as const;

export const SEED_PRODUCT = {
  sku: "airpods-pro",
  name: "AirPods Pro",
  imageUrl: "/products/airpods-pro.svg",
  priceCents: 19900, // $199.00 sticker
} as const;

export function ensureSeed(): void {
  const db = storeDb();
  const existing = db.select().from(products).where(eq(products.sku, SEED_PRODUCT.sku)).all();
  if (existing.length === 0) {
    db.insert(products)
      .values({
        sku: SEED_PRODUCT.sku,
        name: SEED_PRODUCT.name,
        imageUrl: SEED_PRODUCT.imageUrl,
        priceCents: SEED_PRODUCT.priceCents,
        inStock: true,
        updatedAt: new Date().toISOString(),
      })
      .run();
  }
}

export function getProduct(sku: string) {
  ensureSeed();
  return storeDb().select().from(products).where(eq(products.sku, sku)).get();
}

export function latestOrder() {
  return storeDb().select().from(orders).orderBy(desc(orders.createdAt)).get();
}

// The demo lever (Doc 3 §7): move the price; watcher notices on its next tick.
export function setPrice(sku: string, priceCents: number, inStock?: boolean) {
  const db = storeDb();
  db.update(products)
    .set({
      priceCents,
      ...(inStock === undefined ? {} : { inStock }),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(products.sku, sku))
    .run();
  return getProduct(sku);
}

// Reset demo (Doc 4 §3): price back to sticker, in stock, orders cleared.
export function resetStore(): void {
  const db = storeDb();
  db.delete(orders).run();
  ensureSeed();
  db.update(products)
    .set({ priceCents: SEED_PRODUCT.priceCents, inStock: true, updatedAt: new Date().toISOString() })
    .where(eq(products.sku, SEED_PRODUCT.sku))
    .run();
}

// ---- card checks (demo-grade). PAN/CVV are used in-memory only; last4 is the max we keep (Never #3). ----
export function luhnValid(pan: string): boolean {
  const digits = pan.replace(/\D/g, "");
  if (digits.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

export function expiryValid(expiry: string): boolean {
  const m = expiry.match(/^(\d{1,2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!m) return false;
  const month = Number(m[1]);
  if (month < 1 || month > 12) return false;
  let year = Number(m[2]);
  if (year < 100) year += 2000;
  const endOfExpMonth = new Date(year, month, 0, 23, 59, 59, 999); // last day of exp month
  return endOfExpMonth >= new Date();
}

export function last4(pan: string): string {
  return pan.replace(/\D/g, "").slice(-4);
}
