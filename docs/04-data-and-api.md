# Doc 4 — Data & API

> Two SQLite files, one hard rule: Strike touches Wavelength only over HTTP.
> Status: FROZEN pending approval · Depends on: Docs 2–3 · Last updated: 2026-07-23

## 1. Schema — `strike.db`

Drizzle-defined, WAL mode. Types shown as SQLite storage / TS type. All timestamps UTC ISO-8601 text.

**users** — `id` uuid PK · `email` text · `created_at`. (One seeded row.)

**webauthn_credentials** — `credential_id` text PK (base64url) · `user_id` FK→users · `public_key_cose` blob · `sign_count` int · `created_at`.

**mandates** — the SIGNED zone (Doc 2 §1) + runtime:
| Column | Type / constraint |
|---|---|
| `id` | uuid PK |
| `schema_version` | int NOT NULL DEFAULT 1 |
| `user_id`, `credential_id` | FK→users, FK→webauthn_credentials |
| `merchant_id`,`merchant_name`,`merchant_url`,`merchant_country` | text NOT NULL |
| `item_sku`, `item_display_name`, `item_image_url` | text NOT NULL |
| `condition_json` | text NOT NULL — Zod-validated tagged union at write |
| `max_total_cents`, `quantity` | int NOT NULL, CHECK > 0 |
| `currency` | text NOT NULL CHECK = 'USD' (v1) |
| `valid_from`, `valid_until` | text NOT NULL, CHECK valid_until > valid_from |
| `mode` | text CHECK IN ('single_use') |
| `nonce` | text NOT NULL UNIQUE · `nonce_consumed_at` nullable |
| `status` | text CHECK IN ('draft','signed','armed','triggered','executing','fulfilled','failed','expired','revoked','discarded') |
| `signature`,`authenticator_data`,`client_data_json` | blob, nullable until signed |
| `prava_mandate_id` | text nullable — backing Prava one-time mandate, set at arm time once it reports `active` (Doc 2 §7). Added M1. |
| `signed_at`,`resolved_at`,`created_at` | text |

Indices: `(status)` · `(status, valid_until)` (watcher + sweeper) · `(user_id, created_at DESC)` (list screen).

**executions** — `id` uuid PK (**the end-to-end idempotency key**) · `mandate_id` FK **UNIQUE** (single-fire lock #2) · `trigger_snapshot_id` FK→price_snapshots · `quote_total_cents` int · `prava_txn_id` text nullable (Line P marker — the mandate-charge `transactionId`; was `prava_session_id`, renamed M1 for `PRAVA_MODE=mandate`) · `checkout_submitted_at` nullable (Line C marker) · `store_order_id` nullable · `outcome` CHECK IN ('fulfilled','aborted_rearmed','failed','revoked') nullable · `failure_reason` text nullable · `created_at`,`updated_at`.

**audit_events** — `seq` INTEGER PK AUTOINCREMENT (global order) · `mandate_id` FK nullable · `execution_id` nullable · `event_type` text CHECK IN (the 12 Doc 2 events + `PRAVA_CALL`,`RECOVERY_ACTION`) · `actor` CHECK IN ('user','llm','watcher','executor','system','prava') · `payload_json` text NOT NULL · `created_at`. **Append-only, enforced**: `CREATE TRIGGER ... BEFORE UPDATE/DELETE ... SELECT RAISE(ABORT,'audit_events is append-only')`. Index `(mandate_id, seq)`.
Reconstructibility rule: every `status` change and every Prava call writes its event **in the same transaction** (Doc 2 §4); therefore `SELECT * FROM audit_events WHERE mandate_id=? ORDER BY seq` replays the entire life of a mandate, including everything the money path did.

**price_snapshots** — `id` int PK · `merchant_id`,`sku` text · `price_cents` int · `in_stock` bool · `source` text · `observed_at`. Index `(merchant_id, sku, observed_at DESC)`. Watcher writes one row per tick *only when the observation changes* (plus one heartbeat row/min) — keeps the table demo-readable.

**watcher_lease** — `id` CHECK =1 · `holder` text · `heartbeat_at`.

## 2. Schema — `store.db` (Wavelength)

**products** — `sku` text PK · `name` · `image_url` · `price_cents` int CHECK > 0 · `in_stock` bool · `updated_at`.
**orders** — `id` uuid PK · `sku` FK · `quantity` int · `amount_cents` int · `card_last4` text (**only** the last4 — full PAN/CVV are never stored or logged) · `idempotency_key` text **UNIQUE** · `status` CHECK IN ('captured','declined') · `created_at`.

No FK, view, or query crosses the two files. The executor reaches products/orders exclusively via `/store/api/*`.

## 3. API contract

Error envelope everywhere: `{ "error": { "code": "UPPER_SNAKE", "message": "human text" } }`. Auth: `session` = demo-user cookie · `admin` = store-admin cookie · `demo` = requires `DEMO=1` env.

### Strike — `/api/*`
| Endpoint | Auth | Req → Resp | Errors |
|---|---|---|---|
| `POST /api/webauthn/register/options` · `/verify` | session | standard @simplewebauthn shapes | `REG_FAILED` |
| `POST /api/mandates/draft` | session | `{utterance}` *or* `{fields}` → `{mandate(draft), signed_zone, mandate_hash, webauthn}` — LLM parse → Zod gate → persisted draft. `webauthn` = server-issued assertion options with `challenge` = base64url(mandate_hash), so challenge encoding stays server-authoritative (Doc 2 §1). | `PARSE_FAILED`, `VALIDATION_FAILED` (422) |
| `POST /api/mandates/:id/sign` | session | `{assertion}` → `{mandate(armed)}` — runs Doc 2 §3.3; idempotent via nonce consumption (replays hit `NONCE_CONSUMED`) | `NONCE_EXPIRED`, `NONCE_CONSUMED` (409), `HASH_MISMATCH`, `BAD_SIGNATURE`, `ORIGIN_MISMATCH` (401) |
| `GET /api/mandates` | session | → `[{mandate, latest_price, in_stock}]` | — |
| `GET /api/mandates/:id` | session | → `{mandate, execution?, events[], narration}` | `NOT_FOUND` |
| `POST /api/mandates/:id/revoke` | session | → `{mandate}`; idempotent — already-revoked returns 200 with current state; fulfilled returns 409 `REVOKE_TOO_LATE` with the Line C timestamp | `REVOKE_TOO_LATE` (409) |
| `GET /api/mandates/:id/receipt` | session | → verifiable bundle (§4) | `NOT_FOUND` |
| `GET /api/events?after=seq` | session | → `{events[], cursor}` — 2 s UI poll drives all live screens | — |
| `POST /api/demo/reset` | demo | reseed both DBs, price→$199 | — |

### Wavelength — `/store/api/*`
| Endpoint | Auth | Req → Resp | Errors |
|---|---|---|---|
| `GET /store/api/products/:sku` | public | → `{sku,name,price_cents,in_stock,image_url}` | `NOT_FOUND` |
| `POST /store/api/quote` | public | `{sku,quantity}` → `{total_cents, quoted_at}` (live price × qty; no tax/shipping v1) | `OUT_OF_STOCK` |
| `POST /store/api/checkout` | public + **`Idempotency-Key` header REQUIRED** | `{sku,quantity,amount_cents,card:{pan,cvv,expiry}}` → `{order_id,status:'captured',amount_cents}`. Validates amount == live total (else `AMOUNT_MISMATCH` 402 — merchant-overcharge row), Luhn + expiry sanity. **Duplicate key ⇒ 200 with the original order** (crash-safe replay). PAN/CVV used in-memory only. | `AMOUNT_MISMATCH` (402), `OUT_OF_STOCK` (409), `CARD_INVALID` (402), `IDEMPOTENCY_KEY_REQUIRED` (400) |
| `GET /store/admin/login?key=` | public | valid `key` (=`STORE_ADMIN_KEY`) sets the admin cookie, 307→`/store/admin` (Doc 4 A3) | `UNAUTHORIZED` (401) |
| `POST /store/admin/price` | admin | `{sku, price_cents, in_stock?}` → product (the demo lever) | `UNAUTHORIZED` (401), `NOT_FOUND` |
| `POST /store/admin/reset` | admin | restore seed state (price→$199, in stock, orders cleared) | `UNAUTHORIZED` (401) |

Money-path idempotency chain (Doc 3 §4): `execution_id` → Prava session idempotency key → store `Idempotency-Key`. No endpoint that moves money accepts a request without one.

## 4. Verifiable receipt bundle

`GET /api/mandates/:id/receipt` →
```json
{
  "format": "strike-receipt/1",
  "signed_zone": { …exact SIGNED fields… },
  "canonicalization": "RFC8785",
  "mandate_hash": "hex",
  "webauthn": { "credential_id": "…", "public_key_jwk": {…}, "signature": "b64url",
                "authenticator_data": "b64url", "client_data_json": "b64url" },
  "events": [ …full audit trail, seq order… ],
  "generated_at": "…"
}
```
Independent verification recipe (printed in the bundle as `how_to_verify`): (1) JCS-serialize `signed_zone`, SHA-256 it, compare to `mandate_hash`; (2) decode `client_data_json`, confirm its `challenge` == `mandate_hash`; (3) verify `signature` over `authenticator_data || SHA256(client_data_json)` with the JWK. Anyone can run this with 20 lines of script — no Strike server needed. Download button on the receipt screen.

## 5. Reachability walk — every screen & job in one query

| Consumer | Needs | Query | OK? |
|---|---|---|---|
| Mandate list | mandates + current price + stock | `mandates` + correlated subquery on `price_snapshots (merchant_id, sku, observed_at DESC)` — index makes it a top-1 lookup | ⚠️ OK, **the one query needing care** — the correlated subquery must hit that index; verify with `EXPLAIN QUERY PLAN` at build time |
| Create/scope card | draft + hash | returned by `POST draft`; no extra read | ✅ |
| Mandate detail + timeline | row · execution · events | 1 query each (`(mandate_id, seq)` index); composed in the route | ✅ |
| Live updates (all screens) | new events | `audit_events WHERE seq > ? ORDER BY seq` on PK | ✅ |
| Receipt | §4 bundle | mandate ⋈ credential + events — 2 indexed queries | ✅ |
| Watcher tick | due armed mandates | `WHERE status='armed' AND valid_from<=now AND valid_until>now` on `(status, valid_until)` | ✅ |
| Trigger fire | CAS + execution insert | `UPDATE … WHERE id=? AND status='armed'`; `INSERT executions` (UNIQUE) | ✅ |
| Executor | execution ⋈ mandate ⋈ credential | single join on PKs | ✅ |
| Expiry sweeper | expiring armed rows | select on `(status, valid_until)`, then per-row txn (status flip + audit event must be atomic — **no bulk UPDATE**, noted so it isn't "optimized" later) | ✅ |
| Boot recovery | in-flight executions | `executions WHERE outcome IS NULL` ⋈ mandates `status='executing'` | ✅ |
| Store checkout | product + idempotent order | product PK read; `INSERT OR`-conflict on `idempotency_key` | ✅ |

Flagged: only the list screen's latest-price lookup (⚠️ above). Everything else is PK/index-direct.

## Assumptions

- **A1:** UI liveness via 2 s cursor polling on `/api/events` — no SSE/WebSocket in v1 (cut complexity; 2 s is invisible next to the watcher's 3 s tick).
- **A2:** Price snapshots recorded on-change + 1/min heartbeat (not every tick) — keeps audit readable; the *triggering* snapshot is always written and FK'd from the execution.
- **A3:** Store admin auth is a static cookie set by visiting `/store/admin/login?key=<env>` — demo-grade by design, noted on the go-live slide as "not production auth."
- **A4:** LLM narration is generated on-demand in `GET /api/mandates/:id` with a 2 s timeout and template fallback — never stored, never blocking.
