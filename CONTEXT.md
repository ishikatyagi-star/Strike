# Strike — Context for Collaborators (and their agents)

> **Read this first.** You're joining an in-flight hackathon submission. This file
> is the map: why Strike exists, how it's judged, the hard constraints you must
> not break, and where every detail lives. It links out rather than repeating —
> the linked files are the source of truth.

**If you only read three things:** [`README.md`](README.md) (the full product +
evidence), [`AGENTS.md`](AGENTS.md) (the build constitution — the "never" rules),
and the [Hard constraints](#hard-constraints--do-not-break-these) section below.

---

## 1. What Strike is (30 seconds)

A user **passkey-signs one conditional purchase mandate** — merchant, item, price
ceiling, quantity, expiry — and an autonomous agent executes the instant the
condition fires, using a **Prava one-time, network-scoped credential** the card
network refuses to honor outside those bounds.

> *"I want these AirPods Pro, at $180 or below, only from these merchants, before
> Friday."* — say it once, sign once, walk away. It buys when true; it **can't**
> exceed what you signed.

Thesis line we lead with everywhere:
> **Most agents can find a deal. Strike lets you pre-commit safely: one passkey
> signature, a precise conditional mandate, then Prava enforces the final
> merchant, amount, and single-use boundary — even if our app misbehaves.**

---

## 2. Why it was built — the deep-rooted problem

Every AI shopping agent today ends the same way at payment:
1. It **wakes the human up** to confirm — "the deal you wanted at 3am is gone by
   9am" — which defeats the point of an agent, or
2. It **holds a standing card on file** and you must simply trust it not to
   overspend, buy the wrong thing, or get prompt-injected into draining it.

There is no way to say *yes, once, in advance, with hard limits*. That's the gap
Strike closes. The scarce, defensible primitive in agentic commerce isn't
*finding* the deal — it's a **signed, bounded pre-commitment the network itself
enforces.** Full problem framing: [`docs/01-product.md`](docs/01-product.md).

**How the demo shows the depth of the problem:** we don't just show the happy
path. We show the **decline** — an over-cap charge refused by **Visa itself** at
mint time (real `visaCorrelationId`). That proves the safety is enforced by the
card network, not asserted by our code. A judge sees both "it buys autonomously"
*and* "it physically cannot overspend."

---

## 3. The hackathon & how it's judged

**Event:** Agentic Commerce Hackathon (Prava + partners). **Deadline:** Aug 2
7:00 PM PT / **Aug 3 7:30 AM IST**. Teams 1–4; work done in the Aug 1–2 window,
pre-existing work must be disclosed.

**Builder handbook (authoritative):**
https://docs.google.com/document/u/1/d/e/2PACX-1vRg9zmj3a5aWqUJQUaLDT4_SEUQGzt9lGn8aYVC898PTYOFIE3loLW_gCg0aEn334FogipRadhuNyju/pub
**Prizes/tracks:** https://agentic-commerce.devfolio.co/prizes

**Seven judging dimensions:** (1) end-to-end functionality, (2) creativity/novelty,
(3) user value & feasibility, (4) Prava implementation (central, reliable, real —
*not* a payment button at the end), (5) partner-track implementation (materially
used), (6) product experience (understandable, demonstrable), (7) future
potential. The handbook explicitly says **"a generic chat wrapper"** and **"a
mocked payment presented as a transaction"** will NOT stand out — so our payment
is genuinely real and we're honest about what's simulated.

**Tracks we claim (all four apply):** Prava (core), Visa Intelligent Commerce
(real Visa transaction via Prava, incl. the real decline), OpenAI (NL mandate
drafting via structured outputs — verified live), Localhost/Startup. Rationale
per track: [`SUBMISSION.md`](SUBMISSION.md#tracks-claimed).

---

## 4. The non-negotiables that shaped this demo

Two inputs from the organizers directly drove the design. **Honor them in any UI
change.**

**A) The Prava team's submission checklist (received by email — the "non-negotiables"):**
- **A working, public product link is MANDATORY** — "judges must open and try the
  product directly without requesting access." *(This is why we deployed to
  Railway — see [`DEPLOY.md`](DEPLOY.md) — and made `/demo` a single self-contained
  link.)*
- **Public GitHub repo** during judging. *(Done — repo is public.)*
- **No long AI-written descriptions** — "we will not read AI slop." The Devfolio
  **description must be short (3–4 lines) and in the founder's own words.** *Do NOT
  paste README/SUBMISSION prose into the Devfolio description box — those files are
  documentation; the description is hand-written by Ishika.*
- **Demo video = a real pitch** with a teammate on camera, **under 2 min** (max 3),
  uploaded as a **YouTube link**. Not just a silent screen recording.
- Cover image = first screenshot; mention all technologies incl. partner APIs.
- Clear explanation of user/problem/product, the Prava integration + transaction
  outcome, partner-track evidence, pre-existing-vs-built disclosure, and a
  what-worked/didn't/learned summary. *(All of these live in
  [`SUBMISSION.md`](SUBMISSION.md) and [`README.md`](README.md).)*

**B) The build constitution — [`AGENTS.md`](AGENTS.md):** our own hard rules (spend
gate, LLM boundary, sandbox-only, append-only audit, honesty about the simulated
merchant). See §6 below.

---

## 5. What we've built & achieved (state of the world)

- **M0–M8 complete + a `/demo` cockpit**, all committed on `master`.
- **The full thesis runs LIVE on real Prava sandbox rails:** passkey-signed
  mandate → 3s watcher → single spend gate → headless Prava charge → merchant
  checkout → **PAID**. Plus a **real Visa decline** (over-cap → `THRESHOLD_EXCEEDED`).
- **Deployed & try-able:** **https://strike-production-3c6d.up.railway.app/demo**
  (Railway; persistent volume at `/app/data`; watcher always-on).
- **OpenAI drafting verified live** on the hosted instance (gpt-4o-mini parsed
  "175 dollars" → `17500` via structured outputs; falls back to a deterministic
  local parser so it never hard-fails).
- **Real transaction evidence** (pulled from `strike.db`, not fabricated) —
  fulfilled + decline IDs and full audit trail:
  [`README.md`](README.md#transaction-evidence-real-sandbox-ids) /
  [`SUBMISSION.md`](SUBMISSION.md#prava-transaction-evidence-real-sandbox-ids).

**The merchant is deliberately simulated.** "Wavelength" is our own store so we can
move the price on stage deterministically. **Only `airpods-pro` is a verified
checkout path**; the other four products are honestly labeled *"catalog context
only — not testable."* Saying this out loud is part of the trust pitch — never
present the mock merchant as a real integration.

**Recent UX work (already shipped) to make it judge-friendly:**
- `/demo` is a **single link**: it self-unlocks the merchant lever
  (`POST /store/admin/unlock`), so a judge never types another URL.
- **Flexible price control** (slider + number input) so judges set any price, plus
  a guided **4-step walkthrough** and the problem statement in the header.
- `/setup` shows a **"what next"** CTA after passkey registration; `/new` links to
  `/setup` for first-timers; a **merchant selector** labels "Wavelength (demo
  merchant)" with Amazon/Flipkart/Apple as disabled "coming soon" (roadmap).
- Catalogue-only products are **dimmed & non-interactive**; AirPods Pro is badged
  **"Under mandate"** as the product to test.

---

## 6. Hard constraints — DO NOT break these

These come from [`AGENTS.md`](AGENTS.md) and are enforced by lint/DB triggers. A UI
change must never violate them:

1. **One spend path, one gate.** Every Prava/checkout call goes through
   `verifyMandateForExecution()` in `src/lib/executor/`. Never add a second entry
   point to spending. UI never calls Prava directly.
2. **The LLM never authorizes.** `src/lib/llm/` only drafts (Zod-validated) and
   narrates. It is never imported by `src/lib/executor/`. Nothing it emits reaches
   Prava, checkout, or mandate state.
3. **Never store/log PAN, CVV, or token credentials.** `last4` is the maximum that
   persists — including in any new UI/error surface.
4. **`audit_events` is append-only** (DB triggers block update/delete).
5. **Sandbox only.** `sk_test_` / sandbox URLs only. A production key anywhere is a
   stop-everything incident.
6. **Honesty is a feature.** Keep the "Wavelength = demo merchant" and "catalog
   context only" labeling. Don't dress the simulated merchant up as real.
7. **Doc-sync rule:** a behavior change updates the relevant `docs/` file in the
   same commit. UI-only changes generally don't, but read
   [`docs/05-ui.md`](docs/05-ui.md) (the "Instrument" design system + tokens)
   before restyling.

**Also honor:** keep `/demo` a single, self-contained link (no new "type this URL"
steps); keep the sub-3-minute demo flow; keep it **guided, not overwhelming** —
progressive disclosure over walls of text (this is the co-founder's mandate).

---

## 7. Where everything lives (index)

| Topic | File |
|---|---|
| Full product + evidence + roadmap + how-to-run | [`README.md`](README.md) |
| Formal Devfolio write-up (every field) | [`SUBMISSION.md`](SUBMISSION.md) |
| Build constitution (the "never" rules) | [`AGENTS.md`](AGENTS.md) |
| Product / problem / demo script | [`docs/01-product.md`](docs/01-product.md) |
| Mandate schema, trigger grammar, passkey ceremony, state machine | [`docs/02-mandate-spec.md`](docs/02-mandate-spec.md) |
| Architecture, watcher, idempotency, LLM boundary, Prava surface | [`docs/03-architecture.md`](docs/03-architecture.md) |
| Data schemas, audit rules, full API contract, receipt | [`docs/04-data-and-api.md`](docs/04-data-and-api.md) |
| "The Instrument" design system, screens, tokens | [`docs/05-ui.md`](docs/05-ui.md) |
| Deploy to Railway / Fly (env vars, volume, WebAuthn) | [`DEPLOY.md`](DEPLOY.md) |

**External references:**
- Prava docs: https://docs.prava.space · sandbox base `https://sandbox.api.prava.space`
- Prava execution model we use (one-time Mandate, REST `POST /v1/mandates/{id}/charge`):
  summarized in [`docs/02-mandate-spec.md`](docs/02-mandate-spec.md) and
  [`docs/03-architecture.md`](docs/03-architecture.md).
- Builder handbook & prizes: links in §3.
- **Senso** was researched for the Discovery/Trust track and **deliberately not
  used** (not worth the integration cost in the window) — don't reintroduce it as
  a claim.

---

## 8. Run it locally

```bash
npm install
npm run dev        # boots Strike + Wavelength + watcher on :3000, open /demo
```
Sandbox env vars in `.env.local` (never committed) — full list in
[`DEPLOY.md`](DEPLOY.md). Package manager is **npm**. Keep `tsc --noEmit` and
`eslint` clean before every commit.

---

## 9. Key routes (for UI work)

| Route | Purpose |
|---|---|
| `/demo` | **The single demo link** — walkthrough + live mandate (iframe) + merchant lever |
| `/setup` | Passkey registration + pre-flight checklist (+ "what next" CTA) |
| `/new` | Create → ScopeCard → sign (Touch ID) → Arm on Prava (operator step) |
| `/m/[id]` | Live mandate timeline (embedded in `/demo` via iframe) |
| `/m/[id]/receipt` | Verifiable receipt + JSON bundle |
| `/store`, `/store/admin` | Wavelength storefront + operator price lever |

Source layout is in [`README.md`](README.md#repo-layout). The demo cockpit is
`src/app/demo/page.tsx`; the merchant lever API is `src/app/store/admin/`.
