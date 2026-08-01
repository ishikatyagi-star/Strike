// The passkey ceremony (Doc 2 §3). Registration + the deterministic mandate-hash challenge +
// assertion signature verification. The granular §3.3 checks (nonce/type/origin/hash) live in the
// sign route so it can produce the exact Doc 4 error codes and couple the state change to its audit.
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { eq } from "drizzle-orm";
import { strikeDb } from "@/db/client";
import { users, webauthnCredentials } from "@/db/strike-schema";
import { RP_ID, RP_NAME, ORIGIN } from "./config";

export class CeremonyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

// One seeded demo user (Doc 1, Doc 3 A5).
export const DEMO_USER = { id: "00000000-0000-4000-8000-000000000001", email: "admin@intellactai.com" };

export function ensureDemoUser() {
  const db = strikeDb();
  const existing = db.select().from(users).where(eq(users.id, DEMO_USER.id)).get();
  if (!existing) {
    db.insert(users).values({ id: DEMO_USER.id, email: DEMO_USER.email, createdAt: new Date().toISOString() }).run();
  }
  return DEMO_USER;
}

export function listCredentials(userId: string) {
  return strikeDb().select().from(webauthnCredentials).where(eq(webauthnCredentials.userId, userId)).all();
}
export function getCredential(credentialId: string) {
  return strikeDb().select().from(webauthnCredentials).where(eq(webauthnCredentials.credentialId, credentialId)).get();
}
export function firstCredential() {
  return strikeDb().select().from(webauthnCredentials).limit(1).get();
}

// registration challenges are transient (single-user demo) — in-memory across hot reloads.
const g = globalThis as unknown as { __regChal?: Map<string, string> };
g.__regChal ??= new Map<string, string>();
const regChallenges = g.__regChal;

export async function generateRegOptions() {
  const user = ensureDemoUser();
  const existing = listCredentials(user.id);
  const options = await generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(user.id),
    userName: user.email,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "required",
      authenticatorAttachment: "platform", // Touch ID
    },
    excludeCredentials: existing.map((c) => ({ id: c.credentialId })),
  });
  regChallenges.set(user.id, options.challenge);
  return options;
}

export async function verifyRegistration(response: RegistrationResponseJSON) {
  const user = ensureDemoUser();
  const expectedChallenge = regChallenges.get(user.id);
  if (!expectedChallenge) throw new CeremonyError("REG_FAILED", "no registration in progress");
  const verification = await verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  if (!verification.verified || !verification.registrationInfo) {
    throw new CeremonyError("REG_FAILED", "registration not verified");
  }
  const { credential } = verification.registrationInfo;
  strikeDb()
    .insert(webauthnCredentials)
    .values({
      credentialId: credential.id,
      userId: user.id,
      publicKeyCose: Buffer.from(credential.publicKey),
      signCount: credential.counter,
      createdAt: new Date().toISOString(),
    })
    .run();
  regChallenges.delete(user.id);
  return { credentialId: credential.id };
}

// challenge = base64url(utf8(mandate_hash hex)). Deterministic from the SIGNED zone, so the server
// recomputes it at verify time — no stored challenge to trust (Doc 2 §3.2/§3.3).
export function challengeFor(hashHex: string): string {
  return Buffer.from(hashHex, "utf8").toString("base64url");
}

export function authOptionsFor(hashHex: string, credentialId: string) {
  return {
    challenge: challengeFor(hashHex),
    rpId: RP_ID,
    allowCredentials: [{ id: credentialId, type: "public-key" as const }],
    userVerification: "required" as const,
    timeout: 60_000,
  };
}

export function parseClientData(response: AuthenticationResponseJSON) {
  const json = Buffer.from(response.response.clientDataJSON, "base64url").toString("utf8");
  return JSON.parse(json) as { type: string; challenge: string; origin: string };
}

export async function verifyAssertionSignature(
  response: AuthenticationResponseJSON,
  cred: { credentialId: string; publicKeyCose: Buffer | Uint8Array; signCount: number },
  expectedChallenge: string,
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: cred.credentialId,
      publicKey: new Uint8Array(cred.publicKeyCose),
      counter: cred.signCount,
    },
    requireUserVerification: true,
  });
}
