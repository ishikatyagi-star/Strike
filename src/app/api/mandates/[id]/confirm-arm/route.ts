// Arm — phase 2. After the user approves on Prava's surface, find the now-active one-time mandate,
// link it, and flip signed → armed (+ first snapshot). Idempotent: returns {pending} until active.
import { NextResponse } from "next/server";
import { eq, isNotNull } from "drizzle-orm";
import { strikeDb, strikeSqlite } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { listMandates } from "@/lib/prava";
import { wavelengthAdapter } from "@/lib/watcher/adapter";
import { recordSnapshot } from "@/lib/watcher/snapshots";
import { appendEvent } from "@/lib/audit";

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = strikeDb();
  const m = db.select().from(mandates).where(eq(mandates.id, id)).get();
  if (!m) return err("NOT_FOUND", "no such mandate", 404);
  if (m.status === "armed") return NextResponse.json({ ok: true, status: "armed", already: true });
  if (m.status !== "signed") return err("NOT_SIGNED", `status is ${m.status}, expected signed`, 409);

  let pmandates;
  try {
    pmandates = (await listMandates()).mandates;
  } catch (e) {
    return err("PRAVA_ERROR", (e as Error).message, 502);
  }
  const used = new Set(db.select({ p: mandates.pravaMandateId }).from(mandates).where(isNotNull(mandates.pravaMandateId)).all().map((r) => r.p));
  const wanted = (m.maxTotalCents / 100).toFixed(2);
  const match = pmandates
    .filter((x) => x.status === "active" && x.merchantName === m.merchantName && String(x.approvedAmount) === wanted && !used.has(x.id))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!match) return NextResponse.json({ ok: false, pending: true, message: "approval not active yet" });

  const obs = await wavelengthAdapter.observe(m.itemSku);
  const sqlite = strikeSqlite();
  sqlite.transaction(() => {
    sqlite.prepare("UPDATE mandates SET status='armed', prava_mandate_id=? WHERE id=? AND status='signed'").run(match.id, id);
    appendEvent({ mandateId: id, eventType: "MANDATE_ARMED", actor: "system", payload: { prava_mandate_id: match.id, first_snapshot: obs } }, sqlite);
  })();
  if (obs) recordSnapshot(m.merchantId, m.itemSku, obs);
  return NextResponse.json({ ok: true, status: "armed", prava_mandate_id: match.id });
}
