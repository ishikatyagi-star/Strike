# Strike

> **Conditional purchase mandates on Prava rails. Buy it *when*.**
>
> Most agents can find a deal. Strike lets you pre-commit safely: one passkey
> signature, a precise conditional mandate, then Prava enforces the final
> merchant, amount, and single-use boundary — even if our app misbehaves.

**Agentic Commerce Hackathon submission.** This README is the full submission
face — product, problem, Prava integration, transaction evidence, tracks,
disclosure, and roadmap. The formal Devfolio write-up lives in
[`SUBMISSION.md`](SUBMISSION.md); the product contract and demo script are the
single source of truth in [`docs/`](docs/) (Docs 1–5).

- **Repository:** https://github.com/ishikatyagi-star/Strike
- **Run it:** `npm install && npm run dev` → `http://localhost:3000/demo`
- **Demo video:** *(placeholder — link to be added)*

---

## Table of contents

1. [What Strike does](#what-strike-does)
2. [The user, the problem, the product](#the-user-the-problem-the-product)
3. [Problem status & current use case](#problem-status--current-use-case)
4. [How it works](#how-it-works)
5. [Prava integration & transaction outcome](#prava-integration--transaction-outcome)
6. [Transaction evidence (real sandbox IDs)](#transaction-evidence-real-sandbox-ids)
7. [Tracks & partner-track evidence](#tracks--partner-track-evidence)
8. [Run or watch the core flow (judge access)](#run-or-watch-the-core-flow-judge-access)
9. [Safety properties](#safety-properties)
10. [Disclosure — pre-existing vs. hackathon-built](#disclosure--pre-existing-vs-hackathon-built)
11. [What worked, what didn't, what we learned](#what-worked-what-didnt-what-we-learned)
12. [Future scope & roadmap](#future-scope--roadmap)
13. [How this maps to the judging criteria](#how-this-maps-to-the-judging-criteria)
14. [Repo layout](#repo-layout)

---

## What Strike does

Strike lets a user **pre-authorize a specific future purchase** with a single
passkey signature — merchant(s), item, price ceiling, quantity, expiry — and an
autonomous agent executes the instant the condition fires, using a **Prava
one-time, network-scoped credential** that the card network refuses to honor
outside those bounds.

You say it once:

> *"I want these AirPods Pro, this exact configuration, but only at $180 or below,
> and only from Amazon, Flipkart, or apple.com — and only before Friday."*

You sign it once with Touch ID, and walk away. Strike watches; the moment the
price is met it buys — headless, while you sleep — and if anything is off by a
cent or a merchant you didn't name, the payment **declines at the network**.

Today it runs end-to-end on **real Prava sandbox rails** against one merchant
(our Wavelength store). Multi-merchant production is the roadmap — the
architecture is already built for it.

---

## The user, the problem, the product

**The user:** a price-conscious online shopper who knows exactly what they want
and at what price — they just can't sit and watch for it.

**The problem.** Every AI shopping agent today ends the same way at payment:

1. It **wakes the human up** to confirm — "the deal you wanted at 3am is gone by
   9am" — defeating the point of an agent, or
2. It **holds a standing card on file** and you simply have to trust it not to
   overspend, buy the wrong thing, or get prompt-injected into draining it.

There is no way to say *yes, once, in advance, with hard limits* — to
pre-authorize a **specific** future purchase that happens **only** when the world
reaches the state you named, and that is **impossible to exceed** even if the
agent is buggy, hijacked, or malicious.

**The product.** Strike is **pre-approval with teeth**: a passkey-signed
conditional mandate, an autonomous watcher, a single unbypassable spend gate, and
network-level enforcement. Prava answers *"may this agent pay now?"* Strike
answers the harder question — *"the user isn't here; may it pay **later,
conditionally, and only within what they signed?**"*

---

## Problem status & current use case

- **Status:** working, live, end-to-end on real Prava sandbox rails. The full
  thesis (sign → arm → watch → headless charge → PAID) and the decline proof
  (over-cap → real Visa refusal) both execute today. `tsc` + lint clean.
- **Current use case (what's live in this build):** a single verified merchant —
  our **Wavelength** store — with **AirPods Pro** as the verified-checkout
  adapter, price-drop as the live trigger. Natural-language mandate drafting is
  wired via OpenAI structured outputs with a deterministic local fallback.
- **On the production roadmap (next):** real-merchant checkout, recurring
  mandates, multiple live trigger types, discovery/search, and real settlement —
  the core is built to extend to all of them. Today Wavelength's four other
  products are honestly labeled "catalog context only — no checkout claim." We
  name our own simulated surfaces rather than fake them.

---

## How it works

```
NL sentence
   │  OpenAI structured output (Zod-validated)  ── LLM only proposes, never authorizes
   ▼
ScopeCard  ──►  Touch ID passkey signature  (challenge = base64url(mandate_hash))
   │                     server-authoritative, verified vs stored COSE key
   ▼
Arm on Prava  (one-time Mandate: one passkey approval, scope=listed, max_charges=1)
   ▼
3s watcher  ──►  condition fires  (price_below, CAS single-fire — exactly one execution)
   ▼
verifyMandateForExecution()   ── THE single spend gate: re-verifies signature,
   │                              status, expiry, revocation, quote ≤ cap
   ▼
Prava charge  POST /v1/mandates/{id}/charge   (headless; single-use scoped credential)
   ▼
Wavelength checkout  (Idempotency-Key = execution_id)
   ▼
PAID  +  append-only audit trail at every transition
```

---

## Prava integration & transaction outcome

Prava is the **core action**, not a payment button at the end. Strike uses
Prava's **one-time Mandate** primitive:

- **At arm time:** create a `mandate_setup` session (`recurring_frequency:
  one_time`, `merchant_scope: listed`, `max_charges: 1`, amount cap) → user
  approves once with a Prava passkey → poll to `active` → store
  `prava_mandate_id`.
- **At trigger time (headless):** `POST /v1/mandates/{id}/charge` with
  `reference = execution_id` (idempotent) → synchronous response with an inline
  **single-use credential** (token, dynamic CVV, expiry). The mandate settles to
  `consumed`.
- **The transaction outcome is real:** a Visa network credential is minted
  through Prava and used to complete a Wavelength order. The **decline** is a real
  Visa refusal at mint time, not an app-level check.

`src/lib/prava.ts` is the only file that talks to Prava. Sandbox only
(`sandbox.api.prava.space`, `sk_test_` keys). No PAN/CVV/token ever persisted —
`last4` is the maximum stored anywhere.

---

## Transaction evidence (real sandbox IDs)

Pulled from `strike.db`. **Real sandbox transaction IDs, not fabricated** —
traceable through the append-only `audit_events` table.

### ✅ Fulfilled (headless happy path)

| Field | Value |
|---|---|
| Mandate ID | `d6b4e51b-2290-41b6-993f-eba7e8b811d3` |
| Prava Mandate ID | `mdt_01KYZ1ZJC7MVDF0XMG09K06TTK` |
| Prava Transaction ID | `txn_01KYZ28K5YJJXSXFP527XMCK9F` |
| Wavelength Order ID | `6e451270-6869-4db9-8532-5b9bc038a331` |
| Signed cap / executed price | $180.00 / **$174.00** |
| Outcome | `fulfilled` — PAID, **no human input after signing** |

Audit trail: `MANDATE_DRAFTED → MANDATE_SIGNED (Touch ID) → MANDATE_ARMED →
CONDITION_TRIGGERED (watcher) → EXECUTION_STARTED → PRAVA_CALL (SUCCESS) →
EXECUTION_FULFILLED`.

### 🛑 Decline (over-cap, refused by Visa)

| Field | Value |
|---|---|
| Mandate ID | `a0cbae27-f579-4f24-b98d-1c2f71e81b54` |
| Signed cap / attempted | $170.00 / $174.00 |
| Prava Transaction ID | `txn_01KYZ9G3ZQ68ASKD64Y3BAJ04B` |
| Refusal (verbatim) | `status DECLINED: Total amount 174.00 exceeds threshold 170.00 · visaCorrelationId=1785609064_484_1700967850_-687d649f5w8p_VDP_WS` |

Enforcement is the card network, not our application code — the exact property
Strike exists to prove.

---

## Tracks & partner-track evidence

| Track | Implementation & evidence |
|---|---|
| **Prava** ($10k credits) | Core rail. Live one-time Mandate lifecycle — setup, passkey approval, headless charge, single-use scoped credential, settlement — on sandbox. Evidence above. |
| **Visa Intelligent Commerce** ($5k cash) | The transaction is a real Visa network credential minted through Prava; an AI agent completes the purchase autonomously. The decline is a real Visa refusal (`visaCorrelationId` above). |
| **OpenAI** ($10k + $100/participant) | Natural-language mandate drafting via **structured outputs** (`gpt-4o-mini`) — the primary creation experience, materially better than a form. Deterministic local fallback so it never hard-fails. Narration is template-only by design (no LLM in the spend path). |
| **Localhost / Startup** ($5k Anthropic credits) | A working, startup-ready product: clear market, defensible safety model, adapter architecture built to scale to real merchants. |

---

## Run or watch the core flow (judge access)

**Repo:** https://github.com/ishikatyagi-star/Strike (public)

```bash
npm install
npm run dev            # boots Strike + Wavelength + watcher on :3000
```

Required `.env.local` (sandbox only):

```bash
PRAVA_SECRET_KEY=sk_test_...                     # Prava sandbox key
PRAVA_BASE_URL=https://sandbox.api.prava.space
OPENAI_API_KEY=...                               # optional — LLM drafting
OPENAI_MODEL=gpt-4o-mini
LLM_MODE=fixture                                 # deterministic if OpenAI unavailable
DEMO=0
WATCHER=1
STORE_ADMIN_KEY=...
```

Only sandbox (`sk_test_`) Prava keys are accepted. The sandbox test card is
entered **only on Prava's hosted surface** — never in this repo, DB, or logs.

**Core flow (the `/demo` cockpit):**

1. Register the platform passkey at `/setup` (once). Draft a mandate on `/new`
   (natural language or form): *AirPods Pro · price < $180 · before Friday · qty 1*.
2. Sign with Touch ID → **Arm on Prava** (one passkey approval). State → **ARMED**.
3. Open `/demo` (or `/m/[id]`): **Armed — watching** at $199.
4. Drop the Wavelength price to $174 via the merchant lever → watcher fires within
   ~3s → timeline animates **TRIGGERED → token minted (•••• last4) → checkout →
   PAID**. Open the verifiable receipt + download its JSON bundle.
5. **Decline beat:** with a freshly armed mandate whose true trigger is above its
   signed cap, set `DEMO=1` and use **Prove network cap** after the price crosses.
   The passkey signature is still re-verified; only the app-layer cap comparison
   is bypassed, so Prava returns the real `THRESHOLD_EXCEEDED` refusal.

> Do not reuse a completed mandate for the decline beat — its one-time Prava
> mandate is already consumed. Keep a separately armed mandate for the one-tap
> revoke demonstration.

**To watch instead of run:** the demo video (link above) is the same flow
end-to-end. **To verify integrations:** trace the transaction IDs above through
`audit_events` in `strike.db`.

---

## Safety properties

- **One spend gate.** Every Prava charge runs through
  `verifyMandateForExecution()` in the executor call stack — re-verifying
  signature, status, expiry, revocation, and quote ≤ cap. No second entry point,
  enforced by a lint boundary.
- **The LLM never authorizes.** It only drafts (Zod-validated) and narrates;
  nothing it emits reaches Prava, checkout, or mandate state.
- **Network is the backstop.** The credential is single-use and scoped to the
  exact merchant and amount; over-cap/wrong-merchant is refused at the network.
- **No card on file, minimal persistence.** Card credentials exist in memory
  only; `last4` is the maximum stored anywhere.
- **Append-only audit.** Status change and its event commit in one transaction;
  the audit table is append-only (DB triggers block update/delete).
- **Idempotent & crash-safe.** `execution_id` is the idempotency key end-to-end;
  a recovery scan on boot resumes in-flight state without double-charging.

---

## Disclosure — pre-existing vs. hackathon-built

Per the rules, we disclose exactly what predates the hackathon clock:

- **Pre-clock (planning/scaffold), tagged `pre-clock` in git:** the M0 project
  scaffold and the entire [`docs/`](docs/) set (Docs 1–5 — product, mandate spec,
  architecture, data/API, UI). Design and specification artifacts
  only.
- **Built during the hackathon (Aug 1–2):** everything that makes it work — M1–M8
  plus the `/demo` cockpit. The Prava integration (`src/lib/prava.ts`), spend gate
  and executor (`src/lib/executor/`), watcher with CAS single-fire
  (`src/lib/watcher/`), WebAuthn ceremony (`src/lib/webauthn/`), LLM drafter
  (`src/lib/llm/`), the Wavelength merchant, both databases, all six UI screens.
  Every live transaction above was executed during the clock.

Nothing pre-clock touches the spend path; the payment product was built entirely
during the hackathon.

---

## What worked, what didn't, what we learned

**What worked**
- The full headless thesis runs **live on real Prava/Visa sandbox rails** — sign
  once, walk away, autonomous completion, no human in the loop.
- The **decline is real** — an over-cap charge refused by Visa at mint with a real
  `visaCorrelationId`.
- The **single-gate architecture held** — one lint-enforced choke point, LLM kept
  out of the authorization path.
- **Idempotency & crash-safety** — `execution_id` end-to-end + boot recovery, so a
  restart mid-flight never double-charges.

**What didn't (and how we handled it)**
- Prava's **MCP/CLI path can't do headless charging** in sandbox — we discovered
  this early and committed to the correct REST one-time Mandate primitive.
- The **saved-card session flow requires a passkey tap on every payment** — the
  one-time Mandate (approved once at arm time) is what makes autonomy real.
- **OpenAI free-tier daily quota** throttled live drafting — the drafter falls back
  to a deterministic local parser, so creation never hard-fails.
- **Real-merchant checkout is a production-roadmap item** — we built Wavelength as
  an honest, deterministic stage merchant rather than faking an integration.

**What we learned**
- The defensible primitive isn't *finding* the deal — it's a **signed, bounded
  pre-commitment the network itself enforces**. Getting the trust boundary right
  matters more than merchant breadth.
- **Honesty is part of the pitch** — naming our own simulated surfaces makes the
  demo more credible, not less.
- Designing the merchant as an **adapter from day one** means the production path
  (Composio gateway → any merchant) is a configuration surface, not a rewrite.

---

## Future scope & roadmap

The demo proves the hard part (the safety-and-payment core) against one merchant.
The product is that same core pointed at **every** merchant.

1. **Full one-line intent → multi-merchant mandate.** Widen `merchant` from one to
   a signed **set** (Amazon *or* Flipkart *or* apple.com). Sign once; the first
   merchant to satisfy the condition wins the single-use credential; the mandate is
   consumed atomically so you can never be double-charged across merchants.
2. **[Composio](https://composio.dev) as the merchant gateway.** Strike defines one
   adapter contract — `quote / checkout / verifyItem` — and Composio provides the
   connections behind it. One integration surface instead of N bespoke ones; the
   safety core never changes. *(Planned production integration, not shipped this
   hackathon — Amazon/Flipkart/apple.com are illustrative targets.)*
3. **Production Prava + real settlement** — real cards, fulfillment, mandate
   reporting, refunds/disputes wired into the lifecycle.
4. **Richer trigger grammar** — the same watcher fires on restock, fare drops,
   resale-below-X, or composite conditions (`price < X AND in_stock`).
5. **Recurring & budget-scoped mandates** — "restock whenever it drops below $X, up
   to $Y/month," with the same single-gate, network-enforced safety.
6. **Trust & discovery layer** — surface verified merchant/product context *before*
   signing, informing (never authorizing) the pre-commitment.
7. **Multi-tenant, mobile & notifications** — real accounts, native mobile passkey
   signing, and "your mandate just executed while you slept" push with the receipt.

---

## How this maps to the judging criteria

| Criterion | Strike |
|---|---|
| **End-to-end functionality** | Full flow intent → PAID runs live on real Prava sandbox rails. |
| **Creativity & novelty** | Conditional, signed pre-commitment — "futures on retail intent," not a chat wrapper. |
| **User value & feasibility** | Solves a concrete shopper pain; adapter architecture makes it scalable. |
| **Prava implementation** | Central, reliable transaction via the one-time Mandate primitive — real, not mocked. |
| **Track implementation** | Visa (real network transaction + refusal) and OpenAI (structured-output drafting) both materially used. |
| **Product experience** | `/demo` cockpit demonstrates the whole flow in under 3:00, including the failure case. |
| **Future potential** | Clear production path (multi-merchant via Composio, recurring, discovery). |

---

## Repo layout

```
src/app/            Strike routes + /store (Wavelength) + /demo cockpit + API routes
src/lib/prava.ts    the ONLY file that talks to Prava
src/lib/executor/   spend path — gate, execution, recovery (LLM never imported here)
src/lib/watcher/    poll loop, lease, trigger CAS single-fire
src/lib/llm/        NL drafter + template narrator
src/lib/webauthn/   passkey ceremony, JCS canonicalization, hashing
src/db/             drizzle schemas — strike.db + store.db
docs/               the product contract (Docs 1–5) — single source of truth
SUBMISSION.md       the formal Devfolio write-up
```
