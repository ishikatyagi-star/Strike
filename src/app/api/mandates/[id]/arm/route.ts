// Arm — phase 1 (Doc 2 §4 row 4, §7). Create the backing Prava one-time mandate and hand back the
// approval URL. The mandate stays `signed` until the user approves on Prava's surface and phase 2
// (confirm-arm) links it. No money moves here.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { createMandateSetupSession, PravaError } from "@/lib/prava";
import { DEMO_USER } from "@/lib/webauthn/ceremony";

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = strikeDb().select().from(mandates).where(eq(mandates.id, id)).get();
  if (!m) return err("NOT_FOUND", "no such mandate", 404);
  if (m.status === "armed") return NextResponse.json({ ok: true, already_armed: true });
  if (m.status !== "signed") return err("NOT_SIGNED", `status is ${m.status}, expected signed`, 409);

  try {
    const s = await createMandateSetupSession({
      userId: m.userId,
      userEmail: DEMO_USER.email,
      capCents: m.maxTotalCents, // the cap IS the mandate amount (line item must match — M1 finding)
      currency: m.currency,
      merchant: { name: m.merchantName, url: m.merchantUrl, country: m.merchantCountry },
      product: { description: m.itemDisplayName, unitPriceCents: m.maxTotalCents, quantity: m.quantity },
    });
    return NextResponse.json({ ok: true, approval_url: s.iframe_url, session_id: s.session_id, expires_at: s.expires_at });
  } catch (e) {
    const code = e instanceof PravaError ? e.code : "PRAVA_ERROR";
    return err(code, (e as Error).message, 502);
  }
}
