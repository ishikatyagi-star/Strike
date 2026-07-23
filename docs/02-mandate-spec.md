# Doc 2 — The Mandate Spec

> The Mandate is the product. Everything else is plumbing around this object.
> Status: FROZEN pending approval · Depends on: Doc 1 · Last updated: 2026-07-23

## 1. Mandate schema

Two zones: **SIGNED** fields are immutable after signing and covered by the passkey signature; **RUNTIME** fields mutate and are never signed.

| Field | Type | Zone | Notes |
|---|---|---|---|
| `mandate_id` | uuid v4 | SIGNED | Generated server-side at draft creation. |
| `schema_version` | int (=1) | SIGNED | Canonicalization changes bump this. |
| `subject.user_id` | uuid | SIGNED | The approving human. |
| `subject.credential_id` | base64url | SIGNED | WebAuthn credential expected to sign. |
| `merchant.id` | string | SIGNED | Our merchant registry key (`wavelength`). |
| `merchant.name / url / country` | strings | SIGNED | Mirrors what we later pin into the Prava session. |
| `item.sku` | string | SIGNED | Merchant SKU — item identity. |
| `item.display_name / image_url` | strings | SIGNED | For rendering the scope card; name is part of what the user signed. |
| `condition` | tagged union | SIGNED | See §2. Exactly one predicate. |
| `max_total_cents` | int | SIGNED | Ceiling on the **total charge** (price × qty + any fees), not the sticker price. |
| `quantity` | int (=1 for demo) | SIGNED | |
| `currency` | ISO 4217 (`USD`) | SIGNED | |
| `valid_from / valid_until` | UTC ISO-8601 | SIGNED | Validity window. `valid_until` ≤ 30 days out (v1 cap). |
| `mode` | enum `single_use` | SIGNED | `recurring` reserved in the enum, rejected by validation in v1. |
| `nonce` | 128-bit base64url | SIGNED | Server-issued at draft creation, single-use, 15-min TTL. |
| `status` | enum (§4) | RUNTIME | |
| `signature`, `authenticator_data`, `client_data_json` | bytes | RUNTIME | Stored verbatim from the ceremony for re-verification + audit. |
| `mandate_hash` | hex sha-256 | RUNTIME (derived) | Hash of canonical SIGNED zone; recomputed, never trusted from storage. |
| `created_at / signed_at / resolved_at` | UTC | RUNTIME | |

**Canonicalization:** the SIGNED zone is serialized with RFC 8785 (JCS) — sorted keys, no whitespace, canonical numbers. `mandate_hash = SHA-256(JCS(signed_zone))`. **The server is the sole authority for canonicalization and hashing** (browser-side JCS is a bug farm; decided at red-team, 2026-07-24); the client may recompute as a dev-mode assertion only. `schema_version` guards any format change.

## 2. Trigger condition grammar

`condition` is a tagged union — one predicate per mandate:

```json
{ "type": "price_below",   "price_cents": 18000 }
{ "type": "back_in_stock" }
{ "type": "fare_below",    "route": { "origin": "BOM", "dest": "SFO", "depart_date": "2026-08-10" }, "price_cents": 45000 }
```

Rules:
- `price_below` fires when the merchant's **listed item price** for `item.sku` < `price_cents` AND the item is purchasable (in stock). Currency is the mandate's currency — no FX in v1.
- `back_in_stock` fires on availability flipping to purchasable. Schema-complete; UI shows it disabled ("coming soon") for the demo.
- `fare_below` is schema-only in v1 (validation rejects it); it exists to show the union extends beyond retail.
- **Extensibility:** because predicates are a tagged union, a future v2 wraps them in `{"all": [...]}/{"any": [...]}` combinator nodes without re-signing semantics changing — the signed bytes are still one canonical tree. Noted in the doc, not built.
- **Firing semantics:** a predicate is evaluated against a **price snapshot** (source, observed value, timestamp) recorded in the audit log. The condition firing does not spend money — it only moves the state machine (§4). Spending requires the execution gate (§3.4) to re-verify everything.

## 3. The passkey ceremony

### 3.1 Registration (once, at setup — before the demo's 3 minutes)
Standard WebAuthn registration (`navigator.credentials.create`), platform authenticator (Touch ID), `rp.id` = our domain. We store `credential_id`, COSE public key, and sign-count in `webauthn_credentials`. **The public key lives in our database**; the private key never leaves the Secure Enclave.

### 3.2 Signing a mandate (`navigator.credentials.get`)
What the user actually signs, and how it binds to the mandate:

1. Client requests a draft; server creates the mandate row, mints `nonce`, computes `mandate_hash`, and returns the full SIGNED zone **plus the hash** (server-authoritative).
2. Client renders the scope card **from the exact SIGNED zone the server hashed** (no separate display model — what you see is what was hashed). Dev mode recomputes the hash client-side and asserts equality; production trusts the server's — sound because the server is already trusted at signing time: the signature's job is to bind *the user* to these bytes, not to protect the user from our own server.
3. Client requests an assertion with **`challenge = mandate_hash`** (as supplied by the server).
4. The authenticator signs `authenticator_data || SHA-256(client_data_json)`. Since `client_data_json` embeds the challenge, the signature chain is: **signature → client_data_json → challenge = mandate_hash → every SIGNED field.** Flip one bit of merchant, price cap, quantity, or expiry and the hash — therefore the signature — no longer verifies.

### 3.3 Verification at signing time (server)
Reject unless ALL pass: (a) mandate is in `draft` and its nonce is unconsumed and unexpired — consume it now; (b) `client_data_json.type == "webauthn.get"`; (c) `origin` is our exact origin; (d) `challenge` equals the server's own recomputation of `mandate_hash` from the stored draft; (e) signature verifies against the stored public key for `subject.credential_id`; (f) sign-count is not regressive. Then `draft → signed`, storing signature materials verbatim.

### 3.4 Verification at execution time (the spend gate)
Immediately before any Prava call, the executor re-runs, from raw stored bytes: recompute `mandate_hash` from the row's SIGNED fields → verify the stored signature against the stored public key → check `status`, `valid_until`, revocation flag, and that the live quote total ≤ `max_total_cents`. **A signature that fails here aborts the execution and raises an alert — there is no code path to Prava that skips this function.** (This is Convention #1 in CLAUDE.md.)

### 3.5 Why a mandate cannot be replayed or reused
Four independent locks: (1) the **nonce** is consumed at signing — the same assertion presented again hits a non-draft mandate and dies at gate (a); (2) `mandate_hash` includes `mandate_id` + nonce, so the signature cannot be transplanted onto a second mandate; (3) the state machine allows exactly one `armed → triggered → executing` traversal, enforced by an atomic compare-and-swap (§4); (4) even if all our code fails, the **Prava token is single-use, merchant-locked, amount-locked** — a second spend attempt is declined by the card network (§6). Lock 4 is the demo's Beat 5.

## 4. Lifecycle state machine

```
draft ──sign──▶ signed ──verify+register──▶ armed ──condition──▶ triggered ──claim──▶ executing ──▶ fulfilled
  │                                          │  ▲                    │                   │ ├──▶ failed
  ▼                                          │  └────re-arm──────────┼───────────────────┘
discarded                                    ├──▶ expired  ◀─────────┤
                                             └──▶ revoked  ◀─────────┘
```

| # | Transition | Caused by | Audit event (all include mandate_id, actor, UTC ts) |
|---|---|---|---|
| 1 | — → `draft` | User submits creation form | `MANDATE_DRAFTED` + full SIGNED zone |
| 2 | `draft` → `signed` | Passkey assertion passes §3.3 | `MANDATE_SIGNED` + credential_id, sig, client_data |
| 3 | `draft` → `discarded` | User abandons / nonce TTL (15 min) | `MANDATE_DISCARDED` |
| 4 | `signed` → `armed` | Server registers with watcher (immediate, automatic) | `MANDATE_ARMED` + first price snapshot |
| 5 | `armed` → `triggered` | Watcher evaluates predicate true — **atomic CAS on status** | `CONDITION_TRIGGERED` + snapshot (source, price, ts) |
| 6 | `triggered` → `executing` | Executor claims (unique execution row per mandate_id) | `EXECUTION_STARTED` + idempotency key |
| 7 | `executing` → `fulfilled` | Merchant order confirmed; Prava status reported | `EXECUTION_FULFILLED` + order_id, amount, token last4 |
| 8 | `executing` → `armed` (re-arm) | Pre-payment abort: re-quote > cap, or item gone | `EXECUTION_ABORTED` + reason + observed quote |
| 9 | `executing` → `failed` | Payment-stage hard failure (§5) | `EXECUTION_FAILED` + reason + Prava error code |
| 10 | `armed` → `expired` | Sweeper: now > valid_until | `MANDATE_EXPIRED` |
| 11 | `armed`/`triggered` → `revoked` | User one-tap (session auth, no passkey — hard to arm, easy to disarm) | `MANDATE_REVOKED` |
| 12 | `executing` → `revoked` | Revoke lands before the merchant checkout call (§5) | `MANDATE_REVOKED` + `late=false` |

Terminal states: `discarded, fulfilled, failed, expired, revoked`. Every transition writes exactly one append-only audit event **in the same DB transaction** as the status change — the audit log is not best-effort telemetry, it is the system of record (schema in Doc 4).

## 5. Failure matrix

Two bright lines decide everything: **Line P** = the moment we create the Prava session (money machinery engaged). **Line C** = the moment we submit checkout to the merchant (money moves). No behavior below is "the agent decides."

| Failure | When | Exact behavior |
|---|---|---|
| Item gone at execution | Before P | Abort → **re-arm** (row 8). Watcher now requires purchasable=true before re-triggering. Audit: `reason=out_of_stock`. |
| Price rose above cap between trigger and checkout | Before P | Re-quote at execution start; quote > cap ⇒ abort → **re-arm**, keep watching until expiry. Audit: `reason=quote_exceeds_cap` + both prices. |
| Merchant tries to charge more than quoted | After P | Impossible to succeed: Prava token is minted for the exact quoted total; the network declines any higher charge. We observe the decline, report `DECLINED` to Prava, mark **failed** (`reason=merchant_overcharge`), never auto-retry, flag for user. This row is Beat 5's cousin. |
| Partial capture (merchant captures < authorized) | After C | Order stands; mark **fulfilled** with `captured_amount` recorded; audit logs the delta. (Demo store: capture == auth, so this is spec-only.) |
| Duplicate trigger (two watcher cycles race) | At 5 | CAS on `status='armed' → 'triggered'` — exactly one wins; loser is a silent no-op. Execution insert has a UNIQUE(mandate_id) constraint as the second lock. One `CONDITION_TRIGGERED` event ever. |
| Prava session/token call fails | At P | 5xx/timeout: retry ×2, exponential backoff, same idempotency key. Still failing or a hard 4xx/decline ⇒ **failed** (`reason=prava_declined` + code), notify user. No re-arm — payment-side failures need a human. |
| Prava card (network) declines checkout | After P | Report `DECLINED` to Prava, mark **failed**, audit the network response. No auto-retry. |
| Mandate expires mid-execution | Before P: abort → **expired**. | After P: run to completion — the amount was pinned ≤ cap while valid; audit notes `expired_during_execution=true`. |
| User revokes while executing | Before C: honor it — abandon the token unused, report status to Prava, mark **revoked**. | After C: transaction completes → **fulfilled**; audit `revoke_late=true`; UI tells the user the order preceded the revoke by N ms — provable from the log. |
| Process crash mid-execution | Any | On restart, recovery scans `executing` rows: no Prava session recorded ⇒ re-arm; session but no checkout ⇒ resume from idempotency key; checkout submitted ⇒ reconcile via merchant order + Prava payment status. (Mechanics in Doc 3.) |

## 6. Our limits vs Prava's limits

| Bound | Enforced by Strike (app code) | Enforced by Prava / card network |
|---|---|---|
| "Only if the condition is true" | ✅ watcher + execution gate | — (Prava has no concept of our trigger) |
| Signed authorization exists & verifies | ✅ §3.4 gate | — |
| Single fire of the mandate | ✅ state machine CAS | ✅ token is single-use |
| Merchant binding | ✅ mandate.merchant checked | ✅ token locked to merchant pinned in session |
| Amount ceiling | ✅ quote ≤ max_total_cents | ✅ token minted for the exact session amount; higher charge = network decline |
| Time bound | ✅ valid_until | ✅ session/token expires in minutes |
| Card data exposure | — (we never see a PAN) | ✅ zero PCI scope by construction |

**Why Prava is the enforcement layer of last resort:** every row in the left column is code we wrote this weekend and could have gotten wrong. The right column is enforced by the card network on infrastructure we cannot touch. The threat model to state on stage: *assume Strike's application code is fully compromised* — the worst possible outcome is still only the pre-quoted amount, at the signed merchant, once, within a minutes-long window. Our mandate narrows intent; Prava makes the narrowing physical.

## 7. Plan B — compressed window (only if the day-1 spike fails)

If sandbox proves saved-card + approval-off cannot mint a token headlessly: the T0 passkey ceremony creates **both** our mandate signature and the Prava payment session (user completes Prava's approval in the same sitting), and the demo's trigger fires within Prava's 15-minute session window. State machine, audit log, decline beat, and all verification gates are unchanged — only `valid_until` compresses and Line P moves to T0. We do not advertise the horizon on stage; we do not fake any payment. Decision point: end of day-1 spike (Doc 6).

## Assumptions

- **A1:** Canonicalization is RFC 8785 JCS via an off-the-shelf library, **server-side authoritative** (client recompute is a dev-only assertion); `schema_version` guards any change. *(Amended from "both sides" at red-team, 2026-07-24.)*
- **A2:** One registered passkey per user, platform authenticator, demo hardware = our Mac (Doc 1 A1). No credential recovery flow in v1.
- **A3:** "Price" for `price_below` = merchant's listed item price; `max_total_cents` bounds the checkout total. Demo store has no tax/shipping, so listed × qty == total.
- **A4:** Nonce/draft TTL 15 min; `valid_until` capped at 30 days (v1 policy, not a protocol limit).
- **A5:** Re-arm (row 8) is unlimited within the validity window; a mandate can abort and re-arm many times but trigger-and-pay only once.
- **A6:** Revocation requires only an authenticated session, not a passkey (approved: hard to arm, easy to disarm).
- **A7:** Prava saved-card + per-purchase-approval OFF permits headless token minting in sandbox — **unverified until the day-1 spike**; Plan B (§7) is the pre-agreed fallback.
