// WebAuthn RP config. Localhost-only, Chrome-first for the demo (Doc 2 Risk 2 / A2).
export const RP_ID = process.env.WEBAUTHN_RP_ID ?? "localhost";
export const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Strike";
export const ORIGIN = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3000";
