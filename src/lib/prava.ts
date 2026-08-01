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

// ---- integer cents -> Prava's decimal-string amount (AGENTS.md: cents everywhere) ----
function toAmount(cents: number): string {
  return (cents / 100).toFixed(2);
}

// ==== PRAVA_MODE=mandate (Doc 2 §7) — the headless path ====

export interface CreateMandateSetupInput {
  userId: string;
  userEmail: string;
  capCents: number; // max_total_cents — per-charge ceiling, network-enforced
  currency: string;
  merchant: { name: string; url: string; country: string };
  product: { description: string; unitPriceCents: number; quantity: number };
  cardId?: string; // pre-enrolled card; omit to let the user enter it on Prava's surface
}

export interface MandateSetupSession {
  session_id: string;
  session_token: string;
  iframe_url: string; // approval URL — user approves the mandate here with a passkey
  order_id?: string;
  expires_at: string;
  authorizeOnly?: boolean;
}

// Arm-time: create a one-time, merchant-locked mandate. Returns an approval URL the
// user approves once with a passkey; charges after that are headless. No money moves here.
export async function createMandateSetupSession(
  input: CreateMandateSetupInput,
): Promise<MandateSetupSession> {
  return call<MandateSetupSession>("POST", "/v1/sessions", {
    user_id: input.userId,
    user_email: input.userEmail,
    total_amount: toAmount(input.capCents),
    currency: input.currency,
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
            unit_price: toAmount(input.product.unitPriceCents),
            quantity: input.product.quantity,
          },
        ],
      },
    ],
    ...(input.cardId ? { card: { card_id: input.cardId } } : {}),
    mandate_setup: {
      intent: "mandate_setup",
      recurring_frequency: "one_time",
      merchant_scope: "listed",
      max_charges: 1,
    },
  });
}

// Poll after approval until the mandate is active. Shape to confirm with M1 fixtures.
export interface PravaMandate {
  id: string;
  status: string; // 'active' | 'consumed' | ... (confirm)
  [k: string]: unknown;
}
export async function listMandates(): Promise<{ mandates: PravaMandate[] }> {
  return call<{ mandates: PravaMandate[] }>("GET", "/v1/mandates");
}

// Line P (Doc 3 §4): synchronous, headless mint. reference = execution_id (idempotency).
// NEVER log or persist `credentials` (AGENTS.md Never #3) — memory only, last4 max.
export interface ChargeMandateInput {
  mandateId: string;
  amountCents: number;
  reference: string;
  product?: { description: string; unitPriceCents: number; quantity: number };
  merchant?: { name: string; url: string; country: string };
}
export interface MandateChargeResult {
  mandateId: string;
  instructionId?: string;
  transactionId?: string;
  orderId?: string;
  status: string; // 'awaiting_result' | 'failed'
  fetchStatus?: string; // 'SUCCESS' | 'FAILURE'
  errorMessage?: string; // 'THRESHOLD_EXCEEDED' on over-cap (Beat 5)
  deduplicated?: boolean;
  credentials?: {
    token: string;
    dynamicCvv: string;
    expiryMonth: string;
    expiryYear: string;
  };
}
export async function chargeMandate(
  input: ChargeMandateInput,
): Promise<MandateChargeResult> {
  const body: Record<string, unknown> = {
    amount: toAmount(input.amountCents),
    reference: input.reference,
  };
  if (input.product && input.merchant) {
    body.purchase_context = [
      {
        merchant_details: {
          name: input.merchant.name,
          url: input.merchant.url,
          country_code_iso2: input.merchant.country,
        },
        product_details: [
          {
            description: input.product.description,
            unit_price: toAmount(input.product.unitPriceCents),
            quantity: input.product.quantity,
          },
        ],
      },
    ];
  }
  return call<MandateChargeResult>(
    "POST",
    `/v1/mandates/${input.mandateId}/charge`,
    body,
  );
}
