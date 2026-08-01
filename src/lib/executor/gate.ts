// Doc 2 §3.4 — the spend gate. Re-run from raw stored bytes IMMEDIATELY before any Prava call.
// There is no code path to Prava that skips this (AGENTS.md Convention #1). `bypassCap` skips ONLY
// the app-layer cap check and ONLY under DEMO=1 (Beat 5) — it can NEVER skip signature verification.
import { eq } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { mandates, webauthnCredentials } from "@/db/strike-schema";
import { hashOf } from "@/lib/mandate/signed-zone";
import { challengeFor, verifyAssertionSignature } from "@/lib/webauthn/ceremony";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";

type MandateRow = typeof mandates.$inferSelect;

export type GateReason =
  | "bad_signature" // ALERT — should be impossible if our storage is intact
  | "not_executable" // wrong status / revoked
  | "expired"
  | "out_of_stock"
  | "quote_exceeds_cap";

export interface GateResult {
  ok: boolean;
  reason?: GateReason;
  detail?: string;
}

export async function verifyMandateForExecution(
  mandate: MandateRow,
  liveQuote: { total_cents: number; in_stock: boolean },
  opts: { bypassCap?: boolean } = {},
): Promise<GateResult> {
  // (1) the signature must re-verify against the stored public key over the RECOMPUTED hash
  if (!mandate.signature || !mandate.authenticatorData || !mandate.clientDataJson) {
    return { ok: false, reason: "bad_signature", detail: "missing signature materials" };
  }
  const cred = strikeDb().select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, mandate.credentialId)).get();
  if (!cred) return { ok: false, reason: "bad_signature", detail: "credential missing" };

  const expectedChallenge = challengeFor(hashOf(mandate)); // recomputed, never trusted from storage
  const reconstructed = {
    id: mandate.credentialId,
    rawId: mandate.credentialId,
    type: "public-key",
    response: {
      authenticatorData: Buffer.from(mandate.authenticatorData).toString("base64url"),
      clientDataJSON: Buffer.from(mandate.clientDataJson).toString("base64url"),
      signature: Buffer.from(mandate.signature).toString("base64url"),
    },
    clientExtensionResults: {},
  } as unknown as AuthenticationResponseJSON;

  try {
    // counter monotonicity is enforced at signing (§3.3f); re-verifying the SAME stored assertion
    // must accept its original counter, so pass 0 (both-zero is allowed; non-zero passes vs 0).
    const v = await verifyAssertionSignature(reconstructed, { credentialId: cred.credentialId, publicKeyCose: cred.publicKeyCose, signCount: 0 }, expectedChallenge);
    if (!v.verified) return { ok: false, reason: "bad_signature", detail: "re-verify failed" };
  } catch (e) {
    return { ok: false, reason: "bad_signature", detail: (e as Error).message };
  }

  // (2) state / revocation / expiry
  if (mandate.status === "revoked") return { ok: false, reason: "not_executable", detail: "revoked" };
  if (mandate.status !== "triggered" && mandate.status !== "executing") return { ok: false, reason: "not_executable", detail: `status ${mandate.status}` };
  if (Date.parse(mandate.validUntil) <= Date.now()) return { ok: false, reason: "expired" };

  // (3) live quote purchasable and within cap (the bypass never reaches here without DEMO=1)
  if (!liveQuote.in_stock) return { ok: false, reason: "out_of_stock" };
  const bypass = opts.bypassCap === true && process.env.DEMO === "1";
  if (!bypass && liveQuote.total_cents > mandate.maxTotalCents) {
    return { ok: false, reason: "quote_exceeds_cap", detail: `${liveQuote.total_cents} > ${mandate.maxTotalCents}` };
  }
  return { ok: true };
}
