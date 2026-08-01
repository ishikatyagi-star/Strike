// The SIGNED zone (Doc 2 §1) assembled from a mandate row, and its hash. SERVER-AUTHORITATIVE:
// the hash is always recomputed from stored columns, never trusted from storage (Doc 2 §1).
import type { mandates } from "@/db/strike-schema";
import { mandateHash } from "@/lib/webauthn/canonical";

type MandateRow = typeof mandates.$inferSelect;

export function buildSignedZone(m: MandateRow) {
  return {
    mandate_id: m.id,
    schema_version: m.schemaVersion,
    subject: { user_id: m.userId, credential_id: m.credentialId },
    merchant: { id: m.merchantId, name: m.merchantName, url: m.merchantUrl, country: m.merchantCountry },
    item: { sku: m.itemSku, display_name: m.itemDisplayName, image_url: m.itemImageUrl },
    condition: JSON.parse(m.conditionJson),
    max_total_cents: m.maxTotalCents,
    quantity: m.quantity,
    currency: m.currency,
    valid_from: m.validFrom,
    valid_until: m.validUntil,
    mode: m.mode,
    nonce: m.nonce,
  };
}

/** hex SHA-256 of JCS(signed_zone) — the WebAuthn challenge (Doc 2 §3.2). */
export function hashOf(m: MandateRow): string {
  return mandateHash(buildSignedZone(m));
}
