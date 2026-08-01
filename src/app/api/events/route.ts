// Cursor feed for all live screens (Doc 4 §3). Audit events are already append-only and seq is
// their global cursor, so polling is cheap and replayable.
import { NextResponse } from "next/server";
import { gt } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { auditEvents } from "@/db/strike-schema";

export async function GET(req: Request) {
  const raw = Number(new URL(req.url).searchParams.get("after") ?? 0);
  const after = Number.isSafeInteger(raw) && raw >= 0 ? raw : 0;
  const events = strikeDb().select().from(auditEvents).where(gt(auditEvents.seq, after)).orderBy(auditEvents.seq).all();
  return NextResponse.json({
    events: events.map((e) => ({ seq: e.seq, mandate_id: e.mandateId, execution_id: e.executionId, event_type: e.eventType, actor: e.actor, payload: JSON.parse(e.payloadJson), created_at: e.createdAt })),
    cursor: events.at(-1)?.seq ?? after,
  });
}
