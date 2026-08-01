// Doc 2 §3.3 — verification at signing time. Reject unless ALL pass. The nonce is consumed FIRST
// (a failed attempt burns the draft), then type/origin/challenge/signature/counter, each mapped to
// its exact Doc 4 error code. On success: draft → signed, materials stored verbatim, MANDATE_SIGNED
// event in the SAME transaction (Doc 2 §4).
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { strikeDb, strikeSqlite } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { hashOf } from "@/lib/mandate/signed-zone";
import {
  getCredential,
  parseClientData,
  verifyAssertionSignature,
  challengeFor,
} from "@/lib/webauthn/ceremony";
import { ORIGIN } from "@/lib/webauthn/config";
import { appendEvent } from "@/lib/audit";

const NONCE_TTL_MS = 15 * 60 * 1000;

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const assertion = body?.assertion ?? body;

  const db = strikeDb();
  const m = db.select().from(mandates).where(eq(mandates.id, id)).get();
  if (!m) return err("NOT_FOUND", "no such mandate", 404);

  // (a) draft + nonce unconsumed + unexpired
  if (m.status !== "draft" || m.nonceConsumedAt) return err("NONCE_CONSUMED", "mandate already signed or nonce consumed", 409);
  if (Date.now() - Date.parse(m.createdAt) > NONCE_TTL_MS) return err("NONCE_EXPIRED", "draft nonce expired", 409);

  // consume the nonce now — even a rejected attempt burns it (Doc 2 §3.3a / §3.5 lock 1)
  const sqlite = strikeSqlite();
  sqlite.prepare("UPDATE mandates SET nonce_consumed_at = ? WHERE id = ?").run(new Date().toISOString(), id);

  const expectedChallenge = challengeFor(hashOf(m)); // (d) server recomputes the hash
  let clientData: { type: string; challenge: string; origin: string };
  try {
    clientData = parseClientData(assertion);
  } catch {
    return err("BAD_SIGNATURE", "malformed clientDataJSON", 401);
  }
  if (clientData.type !== "webauthn.get") return err("BAD_SIGNATURE", "clientData.type is not webauthn.get", 401); // (b)
  if (clientData.origin !== ORIGIN) return err("ORIGIN_MISMATCH", `origin ${clientData.origin} != ${ORIGIN}`, 401); // (c)
  if (clientData.challenge !== expectedChallenge) return err("HASH_MISMATCH", "signed hash does not match the stored draft", 401); // (d)

  const cred = getCredential(m.credentialId);
  if (!cred) return err("BAD_SIGNATURE", "unknown credential", 401);

  // (e) signature verifies against stored public key; (f) sign-count not regressive
  let verification;
  try {
    verification = await verifyAssertionSignature(assertion, cred, expectedChallenge);
  } catch (e) {
    return err("BAD_SIGNATURE", (e as Error).message, 401);
  }
  if (!verification.verified) return err("BAD_SIGNATURE", "signature did not verify", 401);

  // draft -> signed; store materials verbatim; update counter; audit — one transaction
  const sig = Buffer.from(assertion.response.signature, "base64url");
  const authData = Buffer.from(assertion.response.authenticatorData, "base64url");
  const clientDataJson = Buffer.from(assertion.response.clientDataJSON, "base64url");
  const now = new Date().toISOString();
  sqlite.transaction(() => {
    sqlite
      .prepare(
        "UPDATE mandates SET status='signed', signature=?, authenticator_data=?, client_data_json=?, signed_at=? WHERE id=? AND status='draft'",
      )
      .run(sig, authData, clientDataJson, now, id);
    sqlite
      .prepare("UPDATE webauthn_credentials SET sign_count=? WHERE credential_id=?")
      .run(verification.authenticationInfo.newCounter, m.credentialId);
    appendEvent(
      { mandateId: id, eventType: "MANDATE_SIGNED", actor: "user", payload: { credential_id: m.credentialId, new_counter: verification.authenticationInfo.newCounter } },
      sqlite,
    );
  })();

  const updated = db.select().from(mandates).where(eq(mandates.id, id)).get()!;
  return NextResponse.json({ mandate: { id, status: updated.status, signed_at: updated.signedAt } });
}
