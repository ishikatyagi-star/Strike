# Doc 1 — Product: Strike

> Conditional mandates for agentic commerce: **"buy it when."**
> Status: FROZEN pending approval · Owner: Ishika · Last updated: 2026-07-23

## Problem statement

Every "AI shopping agent" today ends the same way: at the moment of payment, it either wakes the human up to confirm ("the deal you wanted at 3am is gone by 9am"), or it holds a standing card on file and the human just has to trust it. There is no way to say *yes, once, in advance, with hard limits* — to pre-authorize a specific future purchase that only happens if the world reaches the state you named. Strike makes that possible: a user signs a **conditional mandate** with a passkey — merchant, item, price ceiling, quantity, expiry — and an agent executes the instant the condition fires, using a Prava one-time credential that the card network itself refuses to honor outside those bounds.

## The single user, the single job

| | |
|---|---|
| **User** | A price-conscious online shopper who knows exactly what they want and at what price — they just can't sit and watch for it. |
| **Job** | "Commit me to this purchase *now*, execute it *only* when my condition is true, and make it impossible for anyone — including the agent — to spend outside what I signed." |

One user, one job. Not a deals app, not a shopping assistant, not a browser extension.

## Demo narrative (live, projector, ≤ 3:00)

Setup on screen: **the `/demo` cockpit**, with Strike's live mandate on the left and the **Wavelength merchant simulator** on the right (a five-product mock catalogue; AirPods Pro at $199 is the only verified checkout path). We say out loud: *"The store is ours — built so we can move the price on stage. The payment rails are 100% real Prava sandbox: real passkey, real network-scoped token."* Honesty is part of the trust pitch.

| Beat | Clock | What we say | What's on screen |
|---|---|---|---|
| 1. Hook | 0:00–0:20 | "Agents can shop, but they can't be trusted to *wait and spend*. Strike is pre-approval with teeth." | Strike hero screen, one sentence of copy. |
| 2. Create mandate | 0:20–0:55 | "I want these at $180, not $199. I say so once." | Type/select: *AirPods Pro · buy if price < $180 · before Friday · qty 1*. Mandate scope card renders every limit. **Touch ID passkey prompt fires.** State flips to **ARMED**. |
| 3. Armed & watching | 0:55–1:10 | "Strike is now watching. I'm asleep. No card is on file anywhere." | Mandate list: ARMED badge, live price ticker $199, countdown to expiry. |
| 4. The strike | 1:10–1:45 | "It's 3am. Wavelength drops the price." *(we click the clearly labelled merchant-simulator lever → $174)* | Watcher fires within seconds. Live timeline animates: **TRIGGERED → Prava session → token minted (•••• last4) → checkout → PAID $174**. Storefront order-confirmation appears on the right. |
| 5. The decline | 1:45–2:15 | "Now watch the agent try to misbehave." | We replay an execution attempt over the cap / reuse the spent token. Card network **DECLINES**. Audit log shows the refusal — enforcement is the network, not our code. |
| 6. Trust close | 2:15–2:50 | "The LLM never touches the spend decision. The mandate is passkey-signed; the token is single-use and scoped. Revocation is one tap. This is futures on retail intent." | Execution receipt with full audit trail; one-tap revoke on a second mandate; Prava dashboard showing the scoped payment. |

**Backup:** a pre-recorded video of the exact same run, cut by hour 44, on a USB stick *and* a phone.

## Out of scope (deliberately not building)

- Real-merchant checkout (Amazon, ticketing, airlines) — Wavelength's additional catalogue items are visual merchant context only; AirPods Pro is the sole verified checkout path. Real merchants remain the roadmap slide.
- Prava Pay CLI/MCP path — **no sandbox exists for it (live cards)**; REST API + SDK only.
- Recurring / multi-fire mandates — single-use only.
- More than one trigger type live — price-drop is the demo; restock/fare exist only as disabled UI options to show extensibility.
- Product discovery / search / recommendations — the user already knows the item.
- Native mobile app, notifications infra (an in-app activity feed stands in for push).
- Real user accounts / multi-tenancy — one demo user, seeded.
- Refunds, returns, disputes, partial shipments.
- Any real money movement anywhere.

## Success criteria — must all be true at hour 46

1. Live end-to-end run works: sign mandate with a real passkey → price lever → auto-execution → Prava sandbox token → storefront order confirmed — **with no human input after signing**.
2. The decline beat works on demand (over-cap or token-replay attempt refused, refusal visible in audit log).
3. Mandate detail screen shows a complete, human-readable audit timeline for the executed mandate.
4. Full demo rehearsed at least 3× under 3:00 including one recovery from a mid-demo failure.
5. Backup video recorded, on two devices.
6. App survives a backend restart with an armed mandate (state machine resumes, no duplicate fire).

## Why this wins on the stated judging criteria

| Criterion | Our answer |
|---|---|
| Does it actually work | Deterministic demo: our storefront, our price lever, real Prava sandbox rails. Nothing depends on a third party cooperating at demo time. |
| Is the problem clear | One sentence: "pre-approve a purchase once; the agent executes only when your condition fires, and *can't* exceed what you signed." |
| Meaningful agent action | The agent completes a real transaction **while the user is absent** — the strongest version of "agent takes action," not a human-in-the-loop rubber stamp. |
| Payments handled clearly & safely | Passkey-signed mandate → Prava one-time, merchant+amount-scoped token → card-network enforcement. We demo the *failure* case, not just the happy path. |
| Could it become a real product | Prava's own primitives are Session/Passkey/Mandate/Token and their docs say recurring mandates are "planned" — we are a native extension of where the platform is going. Restocks, fares, resales are the same engine. |

## The three biggest holes a judge can poke

1. **"The store is fake."** Concession: yes — deliberately, for determinism. Defense: the *payment* is the real product surface and it's fully real; merchant coverage is exactly what Prava's browser-harness/UCP integrations solve, so real merchants are integration work, not research. We say this before they ask (Beat 4 script).
2. **"Isn't this just Prava with extra steps?"** Prava answers *"may this agent pay now?"* Strike answers *"the user isn't there — may it pay **later, conditionally**?"* The conditional layer — signed trigger semantics, lifecycle, watcher, idempotent execution, audit — is ours, and it's the part that makes Prava's roadmap ("recurring mandates planned") real today.
3. **"The price feed can be manipulated — the agent buys on bad data."** Bounded by design: the worst possible outcome of a corrupted feed is buying the pre-approved item at ≤ the pre-approved price — an outcome the user already signed. The oracle can waste a mandate, never exceed one. (Full failure matrix in Doc 2.)

## Assumptions (unanswered → defaults chosen for a 48h build)

- **A1:** Judging happens at our booth/on stage with our hardware (passkey = Touch ID on our Mac). If judging is on organizer hardware, we fall back to a Chrome profile with a security-key passkey — noted for rehearsal.
- **A2:** "Real transaction" per the rules is satisfied by Prava **sandbox** (no real money at a hackathon). If organizers require live money, decision needed — the CLI live path exists but has no safety net.
- **A3:** Demo item is AirPods Pro on our "Wavelength" storefront; name/branding of the storefront is free to change without affecting any other doc.
- **A4:** One demo user, pre-seeded; the passkey is registered fresh on stage during Beat 2 rehearsal setup, not during the 3 minutes.
