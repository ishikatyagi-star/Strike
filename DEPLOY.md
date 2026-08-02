# Deploying Strike to Railway (the public product link)

Strike needs a **long-running Node process** (persistent SQLite files + the 3-second
watcher loop), so it deploys as a container — not a serverless platform. This uses
the [`Dockerfile`](Dockerfile) in the repo root.

A fresh volume self-bootstraps: the SQLite DDL is `CREATE TABLE IF NOT EXISTS` and the
Wavelength catalog seeds lazily (`ensureSeed()`), so you don't need to ship any DB.

## One-time setup

1. **Create the project.** Railway → New Project → *Deploy from GitHub repo* →
   pick `ishikatyagi-star/Strike`. Railway detects the `Dockerfile` and builds it.

2. **Add a persistent volume.** Service → *Settings → Volumes* → add a volume mounted
   at **`/app/data`**. (This is where `strike.db` and `store.db` live; without it,
   every redeploy wipes mandates and orders.)

3. **Set environment variables** (Service → *Variables*). Sandbox only:

   ```
   PRAVA_SECRET_KEY=sk_test_...
   PRAVA_PUBLISHABLE_KEY=pk_test_...
   PRAVA_BASE_URL=https://sandbox.api.prava.space
   PRAVA_MODE=standard
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL=gpt-4o-mini
   LLM_MODE=live
   WATCHER=1
   DEMO=0
   STORE_ADMIN_KEY=<pick-a-non-default-secret>
   ```

   Leave `WEBAUTHN_*` unset for the first deploy (defaults to localhost — passkeys
   won't work yet; that's expected until step 5).

4. **Deploy** and let Railway assign a public domain
   (Service → *Settings → Networking → Generate Domain*), e.g.
   `strike-production-xxxx.up.railway.app`.

5. **Point WebAuthn at that domain** (this is what makes passkeys work on the hosted
   URL). Add two more variables with your real domain, then redeploy:

   ```
   WEBAUTHN_RP_ID=strike-production-xxxx.up.railway.app
   WEBAUTHN_ORIGIN=https://strike-production-xxxx.up.railway.app
   ```

   `WEBAUTHN_RP_ID` is the bare host (no scheme, no trailing slash);
   `WEBAUTHN_ORIGIN` is the full `https://` origin.

## Make it try-able for judges (no access request needed)

Arming is the only step that needs **your** Prava passkey. Do it once on the hosted
URL, then judges can trigger the rest themselves:

1. Open `https://<domain>/setup`, register a passkey (your device).
2. On `/new`, draft + sign + **Arm on Prava** one or two mandates
   (e.g. AirPods Pro, price < $180). Leave them **ARMED**.
3. A judge opens `/demo`, drops the Wavelength price with the merchant lever, and
   **watches the headless charge fire → PAID** live — the core "wow," done by them.

Keep an eye on the Prava sandbox **30-transactions/day** cap; each fire = 1 charge.

## Notes

- The `sk_test_` sandbox key means no real money moves. Never put a production key here.
- To reset the store price to $199 for a clean state:
  `POST /store/admin/reset` with header `Cookie: wv_admin=<STORE_ADMIN_KEY>`.
- If a build fails on `better-sqlite3`, it's the native module — the Dockerfile already
  installs `python3/make/g++` so a source build works if no prebuilt binary matches.
