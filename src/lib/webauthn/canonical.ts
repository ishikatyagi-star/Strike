// RFC 8785 (JCS) canonicalization — SERVER-AUTHORITATIVE (Doc 2 §1, amended 2026-07-24).
// Constraint that keeps this implementation exactly JCS-compliant: the SIGNED zone
// contains only strings, integers (cents), booleans, and nested objects/arrays —
// no floats. JSON.stringify's ECMAScript number formatting is what JCS specifies,
// so recursive sorted-key serialization is sufficient. Zod validation upstream
// rejects non-integer numbers before anything reaches this function.
import { createHash } from "node:crypto";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

export function canonicalize(value: Json): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isInteger(value)) {
      throw new Error("canonicalize: non-integer numbers are not allowed in the SIGNED zone");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  const parts = keys
    .filter((k) => value[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`);
  return `{${parts.join(",")}}`;
}

/** mandate_hash = SHA-256(JCS(signed_zone)), hex. Used as the WebAuthn challenge. */
export function mandateHash(signedZone: Json): string {
  return createHash("sha256").update(canonicalize(signedZone), "utf8").digest("hex");
}
