# Doc 6 — 48-Hour Build Plan

> Team: **Ishika (operator, QA, presenter) + Claude Code (implementation)**. The specs in /docs are the contract between us; ~32 active human hours over 48 wall-clock hours, AI-pair velocity.
> Status: FROZEN pending approval · Depends on: Docs 1–5 · Last updated: 2026-07-24

## 0. Roles — who does what

| Claude Code (builds) | Ishika only (cannot be delegated) |
|---|---|
| All application code, per Docs 2–5 | Prava/OpenAI accounts, keys, dashboard toggles (per-purchase approval OFF, wallet cap) |
| Tests for the spend gate + state machine | **Every passkey ceremony** (Touch ID is your finger) and test-card enrollment on Prava's surface |
| Seed data, demo reset, fixtures | Rehearsals, projector/hotspot tests, backup video, judging, all human calls on cuts |

Rule of engagement: milestone acceptance = **Ishika runs the demo step herself**, not Claude reporting green tests.

## 1. Wall-clock map (H0 = organizers' clock starts)

| Window | Ishika state | Work |
|---|---|---|
| Pre-clock | awake | M0 (allowed per organizer answer; if that's wrong, M0 = accounts only and the plan still fits — see Risks) |
| H0–H14 | awake | M1 → M2 → M3 → M4 (day-1 target: **trigger fires into the timeline**) |
| H14–H19 | **sleep 1** | Claude continues M5 scaffolding; nothing needing Touch ID scheduled here |
| H19–H32 | awake | M5 accept → M6 → M7 |
| H32–H37 | **sleep 2** | Polish-only tasks queued; no new money-path code while operator sleeps |
| H37–H40 | awake | M8 part 1: seed, rehearse ×1, fix |
| **H40** | — | **FREEZE** (§4) |
| H40–H46 | awake | Rehearse ×2, video, projector test, sleep top-up if green |
| H46–H48 | awake | Buffer. Nothing scheduled. Ever. |

## 2. Milestones (strict dependency order; each independently demoable)

| M | Deliverable → demoable as | Acceptance (Ishika-run) | Budget | Latest cut/decision |
|---|---|---|---|---|
| **M0 Pre-flight** | Repo scaffold (Next.js, Drizzle, tokens, CLAUDE.md), Prava sandbox + OpenAI keys, test card ready | `pnpm dev` boots; S0 checklist screen renders | 2h (pre-clock) | — |
| **M1 Prava spike** | **The gate.** Sandbox: session → collectPAN (test card) → saved-card **headless** re-mint; guardrail-cap refusal probed; REST idempotency-key confirmed | Headless token minted with no human present, OR Plan B declared. **`PRAVA_MODE` decided by H4** — Docs 2 A7 / 3 A1–A2 resolved in writing | 3h | Decision H4, not cuttable |
| **M2 Wavelength** | Store + quote/checkout API (idempotent) + admin lever + reset | Buy with a dummy card via curl; lever drops price; duplicate `Idempotency-Key` returns same order | 2h | not cuttable |
| **M3 Mandate core** | Schema, draft (form-first), JCS hash, **passkey sign ceremony**, ScopeCard, armed state | Ishika signs with Touch ID; tampered draft → `HASH_MISMATCH`; replayed assertion → `NONCE_CONSUMED` | 4h | not cuttable |
| **M4 Watcher + trigger** | 3 s poll, snapshots, CAS trigger, audit timeline live on S3 | Lever → TRIGGERED row cascades on screen ≤ 5 s; two forced concurrent ticks → exactly one trigger | 3h | not cuttable |
| **M5 Executor E2E** | Spend gate + Prava session → token → checkout → report; **the full happy path** | Beat 2–4 sequence works start to finish, hands off after signing; `kill -9` mid-execution → clean recovery on reboot | 4h | not cuttable — **this is the submission line**: if M5 works, we have a demo |
| **M6 Safety beats** | Beat 5 decline (guardrail-cap primary, revoke-session fallback), re-arm on slippage, one-tap revoke, expiry sweeper | Decline shows Prava's real refusal in DeclineBanner; price-bounce → re-arm visible; revoke works | 3h | Slippage/revoke UI cuttable H34 (keep decline) |
| **M7 Product layer** | NL drafting (LLM → Zod → ScopeCard), narration, receipt endpoint + S4, Doc 5 polish pass | Beat 2 works from a typed utterance; receipt downloads + re-verifies; UI hits the Instrument bar | 5h | NL→fixture cut H36 · receipt cut H40 · polish continuous |
| **M8 Demo package** | Seeded second mandate (for revoke beat), reset flow, rehearsals ×3, backup video ×2 devices, projector + hotspot test | Doc 1 success criteria 1–6 all checked by H46 | 4h | not cuttable |

Budgeted: 28h against ~32 available → **4h explicit slack** + the H46–48 buffer.

**Critical path:** M1 → M3 → M5 → M8 (M2 and M4 can interleave; M6/M7 hang off M5). Anything slipping on this path >2h invokes the cut list immediately — solo means no one to parallelize with, so we cut instead.

**Cut list, in order:** 1. NL drafting → fixture (H36) · 2. receipt endpoint (H40) · 3. slippage/revoke visual states — keep logic, drop UI polish (H34) · 4. narration line (anytime). **Never cut:** passkey ceremony, spend gate, decline beat, audit timeline — they are the thesis.

## 3. What "independently demoable" buys us

After every milestone there exists a coherent 60-second story: M2 "here's a store" → M3 "I signed a scoped mandate with my fingerprint" → M4 "it watches and triggers" → M5 the full product → M6 "and here's it refusing to misbehave." If disaster strikes at any point, we present the last completed layer honestly.

## 4. Hour-40 freeze

At H40 the code is done, bugs or not. Allowed after: demo-blocking fixes only (defined as: a Doc 1 success criterion fails during rehearsal), seed data, the video, README. Explicitly banned after H40: refactors, new states, styling beyond token tweaks, "quick" ideas. Remaining time is rehearsal — a solo presenter who has run the script 3× beats a feature no judge notices.

## 5. Risk register

| # | Risk | Early warning | Pre-decided fallback |
|---|---|---|---|
| 1 | Headless saved-card mint not possible in sandbox | M1 spike, by H4 | **Plan B compressed window** (Doc 2 §7), `PRAVA_MODE=compressed`; demo script beats unchanged |
| 2 | WebAuthn friction (origin/rp.id quirks, Safari oddities) | M3's first sign attempt fails >30 min | Chrome-only, localhost-only, passkey pre-registered in S0 before the 3 minutes; ceremony itself is never cut |
| 3 | Prava sandbox flaky/rate-limited at hour 30 | Any 5xx during M1/M5 | Retry logic already spec'd (Doc 3 §6); record the backup video **the first time E2E goes green** (end of M5, not H44) |
| 4 | Solo scope creep / fatigue judgment | Any milestone slips >2h; it's past 2am and we're adding, not fixing | The cut list above is pre-agreed — execute it without re-debating; sleep blocks are not negotiable |
| 5 | Stage-day environment (venue network, projector wash-out) | Hotspot + projector rehearsal at H37–40 fails | Hotspot as primary network; contrast token bump (Doc 5 §1); worst case: the video, which exists since M5 |
| 6 | Organizers disallow pre-clock code (assumption risk) | Rules clarification — **Ishika asks them before H0** | M0 shrinks to accounts/keys; scaffold rebuilds inside H0–H2 at AI velocity; slack absorbs it |

## Assumptions

- **A1:** Pre-clock building is permitted (per your answer "build it all"). Verify with organizers — Risk 6 is the hedge.
- **A2:** "~32 active hours" means Ishika-present hours; Claude Code can be left running on queued, spec'd tasks during sleep blocks, but nothing merges to the money path without operator acceptance after waking.
- **A3:** Backup video is recorded at first green E2E and re-recorded better later if time allows — never only at H44.
- **A4:** Judging happens within a few hours after H48 on our hardware (Doc 1 A1); if a fixed pitch slot exists, M8 rehearsals anchor to it instead.
