// S2 live mandate book (Doc 4 §3). The latest-price correlated lookup is index-aligned with
// price_snapshots(merchant_id, sku, observed_at); Strike never queries the store database here.
import { NextResponse } from "next/server";
import { strikeSqlite } from "@/db/client";

type BookRow = {
  id: string; status: string; item_display_name: string; item_image_url: string; merchant_name: string;
  condition_json: string; max_total_cents: number; quantity: number; valid_until: string; created_at: string;
  price_cents: number | null; in_stock: number | null; observed_at: string | null;
};

export async function GET() {
  const rows = strikeSqlite().prepare(`
    SELECT m.id, m.status, m.item_display_name, m.item_image_url, m.merchant_name,
           m.condition_json, m.max_total_cents, m.quantity, m.valid_until, m.created_at,
           (SELECT ps.price_cents FROM price_snapshots ps WHERE ps.merchant_id=m.merchant_id AND ps.sku=m.item_sku ORDER BY ps.observed_at DESC, ps.id DESC LIMIT 1) AS price_cents,
           (SELECT ps.in_stock FROM price_snapshots ps WHERE ps.merchant_id=m.merchant_id AND ps.sku=m.item_sku ORDER BY ps.observed_at DESC, ps.id DESC LIMIT 1) AS in_stock,
           (SELECT ps.observed_at FROM price_snapshots ps WHERE ps.merchant_id=m.merchant_id AND ps.sku=m.item_sku ORDER BY ps.observed_at DESC, ps.id DESC LIMIT 1) AS observed_at
    FROM mandates m WHERE m.status <> 'discarded'
    ORDER BY CASE WHEN m.status IN ('triggered','executing') THEN 0 WHEN m.status='armed' THEN 1 ELSE 2 END, m.created_at DESC
  `).all() as BookRow[];
  return NextResponse.json(rows.map((m) => ({
    mandate: {
      id: m.id, status: m.status, item: { display_name: m.item_display_name, image_url: m.item_image_url },
      merchant: { name: m.merchant_name }, condition: JSON.parse(m.condition_json), max_total_cents: m.max_total_cents,
      quantity: m.quantity, valid_until: m.valid_until, created_at: m.created_at,
    },
    latest_price: m.price_cents == null ? null : { price_cents: m.price_cents, in_stock: Boolean(m.in_stock), observed_at: m.observed_at },
  })));
}
