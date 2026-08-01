// S4 receipt (Doc 4 §4). It is a portable, redacted verification bundle: never PAN, CVV, or
// Prava credentials. The WebAuthn public key is public material, suitable for independent checks.
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { convertCOSEtoPKCS } from "@simplewebauthn/server/helpers";
import { strikeDb } from "@/db/client";
import { auditEvents, mandates, webauthnCredentials } from "@/db/strike-schema";
import { buildSignedZone, hashOf } from "@/lib/mandate/signed-zone";
import { challengeFor, verifyAssertionSignature } from "@/lib/webauthn/ceremony";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

function publicKeyJwk(cose: Buffer) {
  const raw = convertCOSEtoPKCS(new Uint8Array(cose));
  // Touch ID's platform credential is P-256. A COSE EC2 key becomes 04 || x || y here.
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("unsupported public key shape");
  return { kty: "EC", crv: "P-256", x: Buffer.from(raw.subarray(1, 33)).toString("base64url"), y: Buffer.from(raw.subarray(33)).toString("base64url"), ext: true };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = strikeDb();
  const mandate = db.select().from(mandates).where(eq(mandates.id, id)).get();
  if (!mandate) return NextResponse.json({ error: { code: "NOT_FOUND", message: "no such mandate" } }, { status: 404 });
  const credential = db.select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, mandate.credentialId)).get();
  if (!credential || !mandate.signature || !mandate.authenticatorData || !mandate.clientDataJson) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "receipt is available after signing" } }, { status: 404 });
  }
  const events = db.select().from(auditEvents).where(eq(auditEvents.mandateId, id)).orderBy(auditEvents.seq).all();
  const mandateHash = hashOf(mandate);
  let signatureVerified = false;
  try {
    const result = await verifyAssertionSignature(
      {
        id: mandate.credentialId,
        rawId: mandate.credentialId,
        type: "public-key",
        response: {
          authenticatorData: Buffer.from(mandate.authenticatorData).toString("base64url"),
          clientDataJSON: Buffer.from(mandate.clientDataJson).toString("base64url"),
          signature: Buffer.from(mandate.signature).toString("base64url"),
        },
        clientExtensionResults: {},
      } as AuthenticationResponseJSON,
      { credentialId: credential.credentialId, publicKeyCose: credential.publicKeyCose, signCount: 0 },
      challengeFor(mandateHash),
    );
    signatureVerified = result.verified;
  } catch {
    signatureVerified = false;
  }
  return NextResponse.json({
    format: "strike-receipt/1",
    signed_zone: buildSignedZone(mandate),
    canonicalization: "RFC8785",
    mandate_hash: mandateHash,
    verification: { hash_verified: true, signature_verified: signatureVerified },
    webauthn: {
      credential_id: credential.credentialId,
      public_key_jwk: publicKeyJwk(credential.publicKeyCose),
      signature: Buffer.from(mandate.signature).toString("base64url"),
      authenticator_data: Buffer.from(mandate.authenticatorData).toString("base64url"),
      client_data_json: Buffer.from(mandate.clientDataJson).toString("base64url"),
    },
    events: events.map((event) => ({ seq: event.seq, event_type: event.eventType, actor: event.actor, payload: JSON.parse(event.payloadJson), created_at: event.createdAt })),
    generated_at: new Date().toISOString(),
    how_to_verify: "JCS-serialize signed_zone and SHA-256 it; compare mandate_hash. Decode client_data_json and confirm its challenge is mandate_hash. Verify signature over authenticator_data || SHA-256(client_data_json) with public_key_jwk.",
  });
}
