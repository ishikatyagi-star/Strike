// price_snapshots (Doc 4 §1/A2): write a row only when the observation changes, plus a heartbeat
// once/min — keeps the audit trail demo-readable. The triggering snapshot is always persisted.
import { strikeSqlite } from "@/db/client";
import type { PriceObservation } from "./adapter";

const HEARTBEAT_MS = 60_000;

export interface Snapshot {
  id: number;
  price_cents: number;
  in_stock: boolean;
  source: string;
  observed_at: string;
}

export function recordSnapshot(merchantId: string, sku: string, obs: PriceObservation): Snapshot {
  const db = strikeSqlite();
  const last = db
    .prepare("SELECT id, price_cents, in_stock, observed_at FROM price_snapshots WHERE merchant_id=? AND sku=? ORDER BY observed_at DESC, id DESC LIMIT 1")
    .get(merchantId, sku) as { id: number; price_cents: number; in_stock: number; observed_at: string } | undefined;

  const changed = !last || last.price_cents !== obs.price_cents || Boolean(last.in_stock) !== obs.in_stock;
  const stale = !last || Date.now() - Date.parse(last.observed_at) > HEARTBEAT_MS;

  if (changed || stale) {
    const info = db
      .prepare("INSERT INTO price_snapshots (merchant_id, sku, price_cents, in_stock, source, observed_at) VALUES (?,?,?,?,?,?)")
      .run(merchantId, sku, obs.price_cents, obs.in_stock ? 1 : 0, obs.source, obs.observed_at);
    return { id: Number(info.lastInsertRowid), price_cents: obs.price_cents, in_stock: obs.in_stock, source: obs.source, observed_at: obs.observed_at };
  }
  return { id: last.id, price_cents: last.price_cents, in_stock: Boolean(last.in_stock), source: obs.source, observed_at: last.observed_at };
}
