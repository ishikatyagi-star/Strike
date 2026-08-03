# Strike — Devfolio Submission

> **Most agents can find a deal. Strike lets you pre-commit safely: one passkey
> signature, a precise conditional mandate, then Prava enforces the final
> merchant, amount, and single-use boundary — even if our app misbehaves.**

**▶ Try it live:** https://strike-production-3c6d.up.railway.app/demo
**Repository:** https://github.com/ishikatyagi-star/Strike
**Run locally:** `npm install && npm run dev` → `http://localhost:3000/demo`
(sandbox keys required in `.env.local`; see *Repository & how to run* below).

---

## Name

**Strike** — *conditional purchase mandates on Prava rails.*

## Tagline

Buy it *when*. Pre-approve one specific purchase with a passkey; an agent
executes the instant your condition is true — and the card network itself
refuses to let it spend outside what you signed.

## The one-liner we're building toward

> *"I want these AirPods Pro, this exact configuration, but only at $180 or
> below, and only from Amazon, Flipkart, or apple.com — and only before Friday."*

You say that **once**, sign it **once** with Touch ID, and walk away. Strike
watches every named merchant, and the moment one of them hits your price, the
agent buys — headless, while you sleep — through a Prava one-time credential
scoped to that merchant and that amount. If the price is $1 over, or the agent
tries a merchant you didn't name, the payment network **declines**. The user's
signature is the only authority, and it is mathematically bounded.

Today that runs end-to-end on real Prava sandbox rails against one merchant
(our Wavelength store). The **production** version — multi-merchant, real
checkout, universal reach — is the roadmap below, and the architecture is
already built for it.

---

## Problem

Every AI shopping agent today ends the same way at the moment of payment:

1. It **wakes the human up** to confirm — "the deal you wanted at 3am is gone by
   9am" — which defeats the point of an agent, or
2. It **holds a standing card on file** and you simply have to trust it not to
   overspend, buy the wrong thing, or get prompt-injected into draining it.

There is no way to say *yes, once, in advance, with hard limits* — to
pre-authorize a **specific** future purchase that happens **only** if the world
reaches the state you named, and that is **impossible to exceed** even if the
agent is buggy, hijacked, or malicious.

That's the gap. Agents can *find* deals. Nobody has made it safe for an agent to
*wait and spend* on your behalf.

## Solution

Strike is **pre-approval with teeth**. The user signs a **conditional mandate**
with a passkey — merchant(s), item, price ceiling, quantity, expiry — and an
autonomous watcher executes the instant the condition fires, using a **Prava
one-time, network-scoped credential** that the card network refuses to honor
outside those bounds.

Four properties make it trustworthy, not just convenient:

1. **Signed intent, not a standing card.** No card is on file. The only thing
   that authorizes a spend is a passkey signature over the exact mandate. Change
   one cent of the terms and the signature no longer verifies.
2. **A single, unbypassable spend gate.** Every path to money flows through one
   `verifyMandateForExecution()` choke point that re-verifies the signature,
   status, expiry, revocation, and quote-vs-cap in the same call stack. There is
   no second entry point — by construction, enforced by a lint boundary.
3. **The card network is the final backstop.** Even if our entire app were
   compromised, the Prava/Visa credential is single-use and scoped to the exact
   merchant and amount. Over-cap or wrong-merchant charges are refused *at the
   network*, not just in our code. **We demo this failure case live.**
4. **The LLM never touches the spend decision.** A language model drafts the
   mandate from your sentence and narrates the timeline — nothing it emits ever
   reaches Prava, checkout, or mandate state. "The model proposes; the passkey
   disposes."

**The flow:** `NL sentence → LLM draft (Zod-validated) → ScopeCard → Touch ID
sign → Arm on Prava (one passkey approval) → 3s watcher → condition fires →
spend gate re-verifies signature → headless Prava charge → merchant checkout →
PAID`, with a complete append-only audit trail at every step.

---

## Technologies used

| Technology | Role |
|---|---|
| **Prava** | Core payment rail. One-time **Mandate** primitive: passkey-approved at arm time, charged headless via `POST /v1/mandates/{id}/charge` at trigger time, returning an inline single-use credential (token, dynamic CVV, expiry). Runs live on `sandbox.api.prava.space`. |
| **Visa Intelligent Commerce (via Prava)** | The actual card-network transaction. The scoped credential is a Visa network credential; the over-cap decline in our demo is a **real Visa refusal** (`Total amount 174.00 exceeds threshold 170.00 · visaCorrelationId=…`). The transaction flows through Prava onto Visa rails. |
| **OpenAI** | Natural-language mandate drafting via **structured outputs** (`gpt-4o-mini`) — turns "grab the AirPods Pro under $175 by Friday" into a validated mandate draft. Falls back to a deterministic local parser on error so it never hard-fails. Narration is template-only by design (no LLM in the spend path). |
| **Next.js** | Full-stack app — Strike routes + the embedded Wavelength merchant + all API routes. |
| **WebAuthn / passkeys** | The signing ceremony. Server-authoritative challenge = `base64url(mandate_hash)`; the signature is verified against the stored COSE public key. JCS canonicalization for stable hashing. Real Touch ID on stage. |
| **SQLite (Drizzle ORM)** | Two isolated databases — `strike.db` (mandates, executions, append-only `audit_events`) and `store.db` (Wavelength catalog + idempotent orders). |
| **TypeScript / Zod** | Zod validation at every API-route input and every LLM output boundary; strict types internally. |

---

## Prava transaction evidence (real sandbox IDs)

Pulled from `strike.db` — the most recent live fulfilled run and the live
decline proof. **These are real sandbox transaction IDs, not fabricated.**

### ✅ Fulfilled mandate (the happy path, executed headless)

| Field | Value |
|---|---|
| Mandate ID | `d6b4e51b-2290-41b6-993f-eba7e8b811d3` |
| Prava Mandate ID | `mdt_01KYZ1ZJC7MVDF0XMG09K06TTK` |
| Prava Transaction ID | `txn_01KYZ28K5YJJXSXFP527XMCK9F` |
| Wavelength Order ID | `6e451270-6869-4db9-8532-5b9bc038a331` |
| Item | AirPods Pro · condition `price_below $180.00` |
| Price cap (signed) | $180.00 (`18000` cents) |
| Executed price | $174.00 (`17400` cents) |
| Signed at | 2026-08-01T16:18:24Z (Touch ID) |
| Outcome | `fulfilled` — PAID, no human input after signing |

**Audit trail (append-only, one row per transition):**

```
MANDATE_DRAFTED     user      16:18:16Z
MANDATE_SIGNED      user      16:18:24Z   ← Touch ID passkey signature
MANDATE_ARMED       system    16:19:44Z   ← Prava mandate active
CONDITION_TRIGGERED watcher   16:24:35Z   ← price lever $199 → $174
EXECUTION_STARTED   executor  16:24:35Z
PRAVA_CALL          prava     16:24:38Z   ← txn_01KYZ28K… status SUCCESS
EXECUTION_FULFILLED executor  16:24:38Z   ← Wavelength order 6e451270
```

### 🛑 Decline proof (over-cap charge, refused by Visa)

| Field | Value |
|---|---|
| Mandate ID | `a0cbae27-f579-4f24-b98d-1c2f71e81b54` |
| Price cap (signed) | $170.00 (`17000` cents) |
| Attempted charge | $174.00 (`17400` cents) |
| Prava Transaction ID | `txn_01KYZ9G3ZQ68ASKD64Y3BAJ04B` |
| Outcome | `failed` — **declined at the network** |
| Refusal (verbatim) | `Visa did not return COMPLETED (status DECLINED): Total amount 174.00 exceeds threshold 170.00 · visaCorrelationId=1785609064_484_1700967850_-687d649f5w8p_VDP_WS` |

The enforcement is the card network, not our application code — exactly the
security property Strike exists to prove.

---

## Demo video

*(placeholder — link to be added)*

The video is the exact `/demo` cockpit run: create mandate → Touch ID → ARMED →
merchant price lever drops → watcher fires → headless Prava charge → PAID, then
the over-cap decline beat. A backup recording is held on a second device.

## Screenshots (to attach)

1. `/demo` cockpit — live mandate timeline (left) + Wavelength merchant
   simulator, 5 products (right).
2. ScopeCard — every signed limit rendered (merchant, item, `price_below`, cap,
   qty, expiry) with the Touch ID prompt.
3. ARMED state — live price ticker + expiry countdown, "no card on file" copy.
4. The strike — animated timeline `TRIGGERED → Prava token (•••• last4) →
   checkout → PAID $174` + Wavelength order confirmation.
5. The decline — over-cap attempt, Visa `DECLINED` refusal surfaced in the
   audit log.
6. Execution receipt — full human-readable audit timeline for the fulfilled
   mandate.

---

## Tracks claimed

Strike qualifies for four tracks; we're claiming all four.

| Track | Why Strike qualifies |
|---|---|
| **Prava** ($10k credits) | Core rail. Real one-time Mandate lifecycle — setup, passkey approval, headless charge, single-use scoped credential, settlement — running live on sandbox. |
| **Visa Intelligent Commerce** ($5k cash) | The transaction is a real Visa network credential minted through Prava; an AI agent completes the purchase autonomously. The decline is a real Visa refusal. |
| **OpenAI** ($10k + $100/participant) | Natural-language mandate drafting via structured outputs — the primary creation experience, with a deterministic fallback so it degrades gracefully. |
| **Localhost / Startup** ($5k Anthropic credits) | A working, startup-ready product with a clear market, a defensible safety model, and an adapter architecture built to scale to real merchants. |

---

## Disclosure — pre-existing vs. hackathon-built

Per the rules, we disclose exactly what predates the hackathon clock:

- **Pre-clock (planning/scaffold):** the M0 project scaffold and the entire
  `/docs` set (Docs 1–5: product, mandate spec, architecture, data/API, UI).
  These are design and specification artifacts written before the
  clock started. **They are tagged `pre-clock` in git** for a clean audit trail.
- **Built during the hackathon (Aug 1–2 window):** everything that makes it
  work — M1 through M8 plus the demo cockpit. The Prava integration
  (`src/lib/prava.ts`), the spend gate and executor (`src/lib/executor/`), the
  watcher with CAS single-fire (`src/lib/watcher/`), the WebAuthn signing
  ceremony (`src/lib/webauthn/`), the LLM drafter (`src/lib/llm/`), the
  Wavelength merchant, both databases, all six UI screens, and the `/demo`
  cockpit. Every live transaction above was executed during the clock.

Nothing pre-clock touches the spend path; the payment product was built entirely
during the hackathon.

---

## What's real vs. simulated (we say this before a judge asks)

- **Real:** the Prava/Visa payment rail, the passkey signature, the
  network-scoped single-use credential, the headless charge, the over-cap
  decline, the audit trail, the LLM drafting.
- **Simulated (deliberately, for a deterministic stage demo):** the
  **merchant**. Wavelength is our own store so we can move the price on stage
  without depending on a third party at demo time. Only `airpods-pro` is a
  verified-checkout adapter; the other four products are honestly labeled
  "catalog context only — no checkout claim." The merchant is exactly the piece
  that production connectors replace — it's integration work, not research.

---

## Roadmap — from one merchant to universal, safe, agentic checkout

The demo proves the hard part (the safety-and-payment core) against one merchant.
The product is that same core pointed at **every** merchant. This is the
production vision.

### 1. The full one-line intent → multi-merchant mandate

The signed mandate schema already carries merchant, item, price ceiling,
quantity, and expiry. Production widens **merchant** from one to a **named
set**:

> *"AirPods Pro, this config, at $180 or below, from Amazon **or** Flipkart **or**
> apple.com, before Friday."*

You sign it once. Strike watches all three, and the **first** to satisfy the
condition wins the single-use credential; the mandate is consumed atomically so
you can never be double-charged across merchants. The user picks *who they trust
to buy from* as a first-class, signed part of the mandate — the merchant
allow-list is part of what the network enforces, not a suggestion.

### 2. **Composio** as the merchant gateway — one integration, many merchants

The core spend gate is merchant-agnostic. Production connects real merchants
through **[Composio](https://composio.dev)** — a gateway that exposes many
merchant/tool integrations behind one uniform interface — mapped onto a thin
internal adapter contract:

- Strike defines one adapter contract — `quote(item) → price`,
  `checkout(credential, item) → order`, `verifyItem(spec) → match` — and
  **Composio** provides the connections behind it (Amazon, Flipkart, apple.com,
  ticketing, airlines, …). One integration surface instead of N bespoke ones.
- The watcher, spend gate, executor, and audit log **never change** — they call
  the adapter contract, exactly as they call the Wavelength adapter today.
- Where a merchant is UCP-compatible we use that directly; otherwise Composio
  (or Prava's browser-harness / agentic-checkout surface) fulfills the checkout.
  Adding a merchant is a configuration in the gateway, not a change to the safety
  core.
- **Result: universal reach.** Anyone can pre-commit to any purchase safely,
  because the trust boundary (signed mandate + network-scoped credential) is
  independent of which merchant fulfills it.

*(Composio is a planned production integration, not a current one — Amazon /
Flipkart / apple.com are illustrative targets reachable through the gateway, not
integrations shipped in this hackathon build.)*

### 3. Production Prava + real settlement

Move from sandbox to production Prava: real cards, real settlement, real
fulfillment, mandate reporting, and refund/dispute handling wired into the
lifecycle — the next step on the production roadmap.

### 4. Richer trigger grammar

Price-drop is the live trigger. The engine is general — the same watcher fires
on **restock**, **fare drops**, **resale-below-X**, **back-in-stock size/color**,
or composite conditions (`price < X AND in_stock`). The UI already shows these as
extensibility hooks. Futures on retail intent, not just price alerts.

### 5. Recurring & budget-scoped mandates

Prava's own roadmap lists recurring mandates as planned. Strike extends the
signed-mandate model to **budgeted, recurring** intent — "restock my coffee
whenever it drops below $X, up to $Y/month" — with the same single-gate,
network-enforced safety.

### 6. Trust & discovery layer

Before signing, surface **verified merchant/product context** (is this seller
legitimate for this item at this price?) so the user's pre-commitment is informed
by evidence, not just a name. This is a discovery-side signal that *informs* the
signature — it never becomes an authorization input; the passkey remains the
sole authority.

### 7. Multi-tenant, mobile, and notifications

Real user accounts, a native mobile signing experience (passkeys are already
mobile-native), and a push layer so "your mandate just executed while you slept"
lands on your phone with the full receipt.

---

## Repository & how to run (judge access)

**Repo:** https://github.com/ishikatyagi-star/Strike (public)

```bash
npm install
# add sandbox creds to .env.local:
#   PRAVA_SECRET_KEY=sk_test_...        (Prava sandbox)
#   PRAVA_BASE_URL=https://sandbox.api.prava.space
#   OPENAI_API_KEY=sk-...               (optional — LLM drafting; falls back locally)
#   STORE_ADMIN_KEY=local-dev
npm run dev            # boots Strike + Wavelength + watcher on :3000
```

Then open **`http://localhost:3000/demo`**. For the self-guided judge path, choose
**Run the live demo** and follow the five visible steps: passkey setup, mandate
draft, signature and Prava approval, live Wavelength market test, and verified
receipt. Choose **Explore an existing mandate** to inspect the newest suitable
mandate without creating another one.

For the presenter-operated version, the same cockpit stays under three minutes:

1. Compose a mandate in natural language on `/new` (or use the seeded one).
2. Sign with Touch ID → **Arm on Prava** (one passkey approval).
3. Drop the price with the Wavelength merchant lever → watcher fires within ~3s.
4. Headless Prava charge → Wavelength checkout → **PAID**, full audit timeline.
5. Decline beat: a cap-under-price mandate → real Visa **DECLINED** in the log.

To **watch** rather than run: the demo video (above) is the same flow end-to-end.
To **verify integrations**: the real transaction IDs in *Prava transaction
evidence* above can be traced through the `audit_events` table in `strike.db`.

Sandbox only — no production keys anywhere in the repo (`.env*` is gitignored;
databases are not committed). The sandbox test card is entered only on Prava's
hosted surface, never in this repo, DB, or logs.

---

## What worked, what didn't, what we learned

### What worked
- **The full headless thesis runs live on real Prava/Visa sandbox rails** — sign
  once, walk away, and an autonomous watcher completes the purchase with no human
  in the loop. Real passkey, real network-scoped single-use credential, real
  order. (Evidence above.)
- **The decline is real, not staged.** An over-cap charge is refused by Visa at
  mint time with a real `visaCorrelationId` — the safety property is enforced by
  the network, not asserted by our code.
- **The single-gate architecture held.** Every spend path funnels through one
  `verifyMandateForExecution()` choke point, lint-enforced, with the LLM boundary
  kept entirely out of the authorization path.
- **Idempotency & crash-safety.** `execution_id` as the idempotency key end-to-end
  (Prava charge + merchant checkout), plus a recovery scan on boot, so a restart
  mid-flight never double-charges.

### What didn't (and how we handled it)
- **Prava's MCP/CLI path can't do headless charging** in sandbox — mandate
  charging is deliberately excluded from MCP and there's no sandbox for the live
  CLI. We discovered this early and committed to the **REST one-time Mandate**
  path instead (`POST /v1/mandates/{id}/charge`), which is the correct headless
  primitive.
- **The saved-card session flow requires a passkey tap on *every* payment** — it
  can't be toggled off — which would have broken "no human after signing." The
  one-time Mandate (approved once at arm time) is what makes the autonomy real.
- **OpenAI free-tier daily quota** throttled live drafting during the build; we
  designed the drafter to **fall back to a deterministic local parser** on any
  error, so the creation flow never hard-fails regardless of quota.
- **Real-merchant checkout is a production-roadmap item** — we were honest and
  built Wavelength as a deterministic stage merchant rather than faking an Amazon
  integration, and labeled non-checkout products as "catalog context only."

### What we learned
- The scarce, defensible primitive in agentic commerce isn't *finding* the deal —
  it's a **signed, bounded pre-commitment the network itself enforces**. Getting
  the trust boundary right (signature + scoped credential) matters more than
  merchant breadth, and it's what makes the rest safe to scale.
- **Honesty is part of the pitch.** Saying out loud "the store is ours; the
  payment is 100% real" makes the demo *more* credible, not less — judges trust
  a team that names its own simulated surfaces.
- Designing the merchant as an **adapter from day one** meant the production path
  (Composio gateway → any merchant) is a configuration surface, not a rewrite.

---

## Why this becomes a real product

The demo is narrow on purpose — one merchant, one trigger — but the **core is the
product**: a signed-intent primitive with an unbypassable spend gate and
network-level enforcement, wrapped in an adapter architecture that scales to any
merchant without ever weakening the safety boundary. Prava answers *"may this
agent pay now?"* Strike answers the harder question — *"the user isn't here; may
it pay **later, conditionally, and only within what they signed?**"* That
conditional layer is the part that makes autonomous agentic commerce safe enough
to actually trust.
