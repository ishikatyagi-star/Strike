<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Strike — Build Constitution

Conditional purchase mandates on Prava rails, built for the Agentic Commerce hackathon. **The /docs set is the single source of truth.** If code and docs disagree, the docs win until changed by the rule at the bottom.

## Doc index

| Doc | Owns |
|---|---|
| [docs/01-product.md](docs/01-product.md) | Problem, demo script (6 beats ≤ 3:00), out-of-scope, hour-46 success criteria |
| [docs/02-mandate-spec.md](docs/02-mandate-spec.md) | **The core.** Mandate schema, trigger grammar, passkey ceremony, state machine, failure matrix, Prava-as-last-resort |
| [docs/03-architecture.md](docs/03-architecture.md) | Stack, components, watcher, idempotency, LLM boundary, Prava surface, demo mode |
| [docs/04-data-and-api.md](docs/04-data-and-api.md) | Both schemas, audit-log rules, full API contract, verifiable receipt |
| [docs/05-ui.md](docs/05-ui.md) | "The Instrument" design system, 6 screens, tokens |
| [docs/06-build-plan.md](docs/06-build-plan.md) | Milestones M0–M8, cut list, hour-40 freeze, risk register |

## Never — no exceptions, no demo shortcuts

1. **No spend path without the gate.** Every call to Prava or `/store/api/checkout` goes through `verifyMandateForExecution()` (Doc 2 §3.4) in the same call stack. No second entry point, ever — including debug code. (`DEMO_BYPASS_GATE` for Beat 5 skips only the *app-layer cap check*, is compiled out unless `DEMO=1`, and still cannot skip signature verification.)
2. **No LLM output is ever an authorization input.** The LLM proposes drafts (Zod-validated) and writes narration. It has no tools, no imports into `src/lib/executor/`, and nothing it emits reaches Prava, checkout, or mandate state. Lint boundary enforces it; don't "temporarily" relax the lint rule.
3. **Never store or log PAN, CVV, or Prava token credentials.** Memory only; `last4` is the maximum that persists anywhere, including error messages and audit payloads.
4. **`audit_events` is append-only.** The status change and its event commit in one transaction; no bulk status updates without per-row events; never drop the append-only trigger.
5. **Sandbox only.** `sk_test_`/sandbox base URLs are the only Prava credentials in this repo. A production key appearing anywhere is a stop-everything incident.
6. **No new features after hour 40** (Doc 6 §4). Demo-blocking fixes only.

## Conventions

- **Package manager:** npm (no pnpm on this machine). `npm run dev` boots everything.
- **Money:** integer cents everywhere, columns/fields suffixed `_cents`. No floats touching money, ever. **Time:** UTC ISO-8601 strings.
- **Errors:** every API error is `{ error: { code: UPPER_SNAKE, message } }` with codes from Doc 4 §3 — invent no codes without adding them to the doc.
- **Boundaries validate:** Zod schemas at every API route input and LLM output; internal functions trust their types.
- **Naming:** state names, event types, and error codes are copied verbatim from Doc 2/4 tables — no synonyms (`STRUCK` is UI copy; the state is `triggered`).
- **Folders:**
  ```
  src/app/            # Strike routes + /store (Wavelength) routes
  src/lib/prava.ts    # the ONLY file that talks to Prava
  src/lib/executor/   # spend path (gate, execution, recovery)
  src/lib/watcher/    # poll loop, lease, trigger CAS
  src/lib/llm/        # drafter + narrator — never imported by executor/
  src/lib/webauthn/   # ceremony, canonicalization (JCS, server-authoritative), hashing
  src/db/             # drizzle: strike.db + store.db (no cross-file queries)
  docs/               # the contract
  ```
- **Idempotency:** anything that can move money takes `execution_id` as its idempotency key (Doc 3 §4). A retry without the same key is a bug.
- **Tests that must exist** (small, targeted, no coverage theater): spend-gate rejects (bad sig / expired / revoked / over-cap), trigger CAS under two racing ticks, checkout idempotent replay, JCS hash stability.

## The doc-sync rule

**Any decision change during the build updates the relevant doc in the same commit** — including cut-list executions and the M1 `PRAVA_MODE` decision (recorded in Doc 2 §7 / Doc 3 §6). A commit that changes behavior with no doc diff is wrong by definition. Assumptions resolved during the build get their `A#` line edited in place with the outcome.
