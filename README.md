# Strike

Conditional purchase mandates on Prava rails. A user signs one passkey-bound mandate for a named item, merchant, cap, trigger, and expiry; Strike watches the merchant and executes only when the signed condition is true.

The product contract and demo script live in [`docs/`](docs/). Those documents take precedence over this runbook.

## Run locally

Use npm and start the app with:

```bash
npm run dev
```

Open `http://localhost:3000/setup` first to register the platform passkey. Then use `http://localhost:3000/new` to draft, sign, and arm a mandate. The Wavelength price lever is at `/store/admin` after signing in through its documented local admin route.

Required local configuration remains in `.env.local`:

```bash
PRAVA_SECRET_KEY=sk_test_...
PRAVA_BASE_URL=https://sandbox.api.prava.space
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
LLM_MODE=fixture
DEMO=0
WATCHER=1
STORE_ADMIN_KEY=...
```

Only sandbox (`sk_test_`) Prava keys are accepted. `LLM_MODE=fixture` keeps natural-language drafting and narration deterministic if the OpenAI API is unavailable.

## Three-minute demo run

1. Start at `/new`; create the $180 AirPods mandate, sign with Touch ID, then approve the one-time Prava mandate.
2. Open its detail timeline at `/m/[id]`; show **Armed — watching** at the $199 price.
3. In a second window, use the Wavelength admin lever to drop to $174. The timeline should show **STRUCK → token minted → PAID**.
4. Open the verifiable receipt and download its JSON bundle.
5. For the decline beat, use a freshly armed mandate whose true trigger is above its signed cap, set `DEMO=1`, and use **Prove network cap** after the price crosses its trigger. The app still re-verifies the passkey signature; only its app-layer cap comparison is bypassed, so Prava returns the real `THRESHOLD_EXCEEDED` refusal.

Do not use a completed mandate for the decline beat: its one-time Prava mandate has already been consumed. Keep a separately armed mandate available for the one-tap revoke demonstration.

## Safety properties

- Every Prava charge runs through `verifyMandateForExecution()` in the executor call stack.
- The LLM only drafts and narrates; it cannot trigger, approve, or execute a payment.
- Card credentials exist in memory only; persisted data is limited to the final four digits.
- Status changes and audit events commit together, and the audit table is append-only.
