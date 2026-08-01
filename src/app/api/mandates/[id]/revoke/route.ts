// One-tap revoke (Doc 2 §4 row 11–12). It is deliberately easy to disarm: no passkey ceremony.
// The status transition and its append-only audit event commit together.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { strikeDb, strikeSqlite } from "@/db/client";
import { executions, mandates } from "@/db/strike-schema";
import { appendEvent } from "@/lib/audit";

function error(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: { code, message }, ...extra }, { status });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = strikeDb();
  const mandate = db.select().from(mandates).where(eq(mandates.id, id)).get();
  if (!mandate) return error("NOT_FOUND", "no such mandate", 404);
  if (mandate.status === "revoked") {
    return NextResponse.json({ mandate: { id: mandate.id, status: mandate.status }, already_revoked: true });
  }

  const execution = db.select().from(executions).where(eq(executions.mandateId, id)).get();
  // After Line C, a card token may already be at the merchant. We cannot truthfully promise a
  // cancellation, so preserve the execution's terminal outcome instead of overwriting it.
  if (mandate.status === "fulfilled" || execution?.checkoutSubmittedAt) {
    return error("REVOKE_TOO_LATE", "checkout was already submitted", 409, {
      checkout_submitted_at: execution?.checkoutSubmittedAt ?? mandate.resolvedAt,
    });
  }
  if (mandate.status !== "armed" && mandate.status !== "triggered" && mandate.status !== "executing") {
    return error("REVOKE_TOO_LATE", `mandate is already ${mandate.status}`, 409);
  }

  const sqlite = strikeSqlite();
  let revoked = false;
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    const moved = sqlite
      .prepare("UPDATE mandates SET status='revoked', resolved_at=? WHERE id=? AND status IN ('armed','triggered','executing')")
      .run(now, id);
    if (moved.changes !== 1) return;
    if (execution) {
      sqlite
        .prepare("UPDATE executions SET outcome='revoked', failure_reason='user_revoked', updated_at=? WHERE id=?")
        .run(now, execution.id);
    }
    appendEvent(
      {
        mandateId: id,
        executionId: execution?.id,
        eventType: "MANDATE_REVOKED",
        actor: "user",
        payload: { late: false, revoked_at: now },
      },
      sqlite,
    );
    revoked = true;
  })();

  if (!revoked) {
    const current = db.select().from(mandates).where(eq(mandates.id, id)).get();
    if (current?.status === "revoked") return NextResponse.json({ mandate: { id, status: "revoked" }, already_revoked: true });
    return error("REVOKE_TOO_LATE", "execution advanced before the revoke could be applied", 409);
  }
  return NextResponse.json({ mandate: { id, status: "revoked" } });
}
