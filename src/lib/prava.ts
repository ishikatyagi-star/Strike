// The ONLY file that talks to Prava (Doc 3 §6). Shapes from docs.prava.space;
// M1 spike replaces assumptions with captured sandbox fixtures.
// NEVER: log/store token PAN or CVV (AGENTS.md Never #3). Sandbox keys only (Never #5).

const BASE_URL = process.env.PRAVA_BASE_URL ?? "https://sandbox.api.prava.space";
const SECRET_KEY = process.env.PRAVA_SECRET_KEY ?? "";

if (SECRET_KEY && !SECRET_KEY.startsWith("sk_test_")) {
  // Never #5: refuse to boot against anything but sandbox credentials.
  throw new Error("PRAVA_SECRET_KEY must be a sandbox key (sk_test_...)");
}

export class PravaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

export function pravaConfigured(): boolean {
  return SECRET_KEY.length > 0;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000), // Doc 3 §6
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new PravaError(json?.error?.code ?? "PRAVA_HTTP_ERROR", json?.error?.message ?? text, res.status);
  }
  return json as T;
}

// ---- Surface per Doc 3 §6 (shapes to be confirmed/adjusted in M1 spike) ----

export interface CreateSessionInput {
  executionId: string; // our end-to-end idempotency key
  userId: string;
  userEmail: string;
  totalCents: number;
  currency: string;
  merchant: { name: string; url: string; country: string };
  product: { description: string; unitPriceCents: number; quantity: number };
}

export async function createSession(input: CreateSessionInput) {
  return call<{ session_token: string; iframe_url: string; session_id?: string }>(
    "POST",
    "/v1/sessions",
    {
      user_id: input.userId,
      user_email: input.userEmail,
      total_amount: (input.totalCents / 100).toFixed(2),
      currency: input.currency,
      idempotency_key: input.executionId, // Doc 3 A1 — confirm in M1
      purchase_context: [
        {
          merchant_details: {
            name: input.merchant.name,
            url: input.merchant.url,
            country_code_iso2: input.merchant.country,
          },
          product_details: [
            {
              description: input.product.description,
              unit_price: (input.product.unitPriceCents / 100).toFixed(2),
              quantity: input.product.quantity,
            },
          ],
        },
      ],
    },
  );
}

// TODO(M1): getPaymentResult (poll to 60s budget), reportStatus, revokeSession, listCards.
// Each lands here with real sandbox fixtures saved to fixtures/prava/.
