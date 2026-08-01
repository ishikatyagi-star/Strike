import { NextResponse } from "next/server";
import { randomUUID, randomBytes } from "node:crypto";
import { strikeDb, strikeSqlite } from "@/db/client";
import { mandates } from "@/db/strike-schema";
import { DraftInput, validateDraftSemantics } from "@/lib/mandate/schema";
import { resolveItem } from "@/lib/mandate/registry";
import { buildSignedZone, hashOf } from "@/lib/mandate/signed-zone";
import { ensureDemoUser, firstCredential, authOptionsFor } from "@/lib/webauthn/ceremony";
import { appendEvent } from "@/lib/audit";

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export async function POST(req: Request) {
  let input;
  try {
    input = DraftInput.parse(await req.json());
  } catch {
    return err("VALIDATION_FAILED", "invalid draft fields", 422);
  }
  if (validateDraftSemantics(input)) return err("VALIDATION_FAILED", "draft outside allowed bounds", 422);

  const user = ensureDemoUser();
  const cred = firstCredential();
  if (!cred) return err("REG_FAILED", "register a passkey before drafting", 400);

  const resolved = resolveItem(input.merchant_id, input.item_sku);
  if (!resolved) return err("VALIDATION_FAILED", "unknown merchant/item", 422);

  const now = new Date().toISOString();
  const id = randomUUID();
  const row = {
    id,
    schemaVersion: 1,
    userId: user.id,
    credentialId: cred.credentialId,
    merchantId: resolved.merchant.id,
    merchantName: resolved.merchant.name,
    merchantUrl: resolved.merchant.url,
    merchantCountry: resolved.merchant.country,
    itemSku: resolved.item.sku,
    itemDisplayName: resolved.item.display_name,
    itemImageUrl: resolved.item.image_url,
    conditionJson: JSON.stringify(input.condition),
    maxTotalCents: input.max_total_cents,
    quantity: input.quantity,
    currency: "USD",
    validFrom: now,
    validUntil: input.valid_until,
    mode: "single_use",
    nonce: randomBytes(16).toString("base64url"), // 128-bit, single-use, 15-min TTL
    nonceConsumedAt: null,
    status: "draft" as const,
    signature: null,
    authenticatorData: null,
    clientDataJson: null,
    signedAt: null,
    resolvedAt: null,
    createdAt: now,
  };

  const signedZone = buildSignedZone(row);
  const hash = hashOf(row);
  const sqlite = strikeSqlite();
  sqlite.transaction(() => {
    strikeDb().insert(mandates).values(row).run();
    appendEvent({ mandateId: id, eventType: "MANDATE_DRAFTED", actor: "user", payload: { signed_zone: signedZone } }, sqlite);
  })();

  // signed_zone is exactly what was hashed; the client renders the ScopeCard from it (Doc 2 §3.2).
  return NextResponse.json({
    mandate: { id, status: "draft" },
    signed_zone: signedZone,
    mandate_hash: hash,
    webauthn: authOptionsFor(hash, cred.credentialId),
  });
}
