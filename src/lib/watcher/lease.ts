// Leader lease (Doc 3 §3): hygiene against double loops after hot reload. The REAL single-fire
// guarantee is data-level (the trigger CAS + UNIQUE execution) — this just keeps one loop polling.
import { randomUUID } from "node:crypto";
import { strikeSqlite } from "@/db/client";

const LEASE_TTL_MS = 10_000;
export const HOLDER = randomUUID();

export function acquireOrRenew(): boolean {
  const db = strikeSqlite();
  db.prepare("INSERT OR IGNORE INTO watcher_lease (id, holder, heartbeat_at) VALUES (1, ?, ?)").run(HOLDER, new Date().toISOString());
  const cutoff = new Date(Date.now() - LEASE_TTL_MS).toISOString();
  const res = db
    .prepare("UPDATE watcher_lease SET holder=?, heartbeat_at=? WHERE id=1 AND (holder=? OR heartbeat_at < ?)")
    .run(HOLDER, new Date().toISOString(), HOLDER, cutoff);
  return res.changes === 1;
}
