"use client";
// S1 · Create mandate (Doc 5). Form → ScopeCard (rendered from the exact SIGNED bytes the server
// hashed) → passkey sign → arm on Prava. "What you see is what you sign" (Doc 2 §3.2).
import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

type SignedZone = {
  item: { display_name: string; image_url: string };
  merchant: { name: string; country: string };
  condition: { type: string; price_cents: number };
  max_total_cents: number;
  quantity: number;
  currency: string;
  valid_until: string;
  mode: string;
};
type Draft = { mandate: { id: string; status: string }; signed_zone: SignedZone; mandate_hash: string; webauthn: unknown };
type Phase = "form" | "drafting" | "review" | "signing" | "signed" | "arming" | "armed" | "error";

export default function NewMandate() {
  const [merchant, setMerchant] = useState("wavelength");
  const [trigger, setTrigger] = useState(180);
  const [cap, setCap] = useState(180);
  const [qty, setQty] = useState(1);
  const [days, setDays] = useState(3);
  const [utterance, setUtterance] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState("");
  const [needsPasskey, setNeedsPasskey] = useState(false);
  const [armMsg, setArmMsg] = useState("");

  async function makeDraft() {
    setPhase("drafting");
    setErr("");
    const body = utterance.trim() ? { utterance: utterance.trim() } : {
      merchant_id: merchant,
      item_sku: "airpods-pro",
      condition: { type: "price_below", price_cents: Math.round(trigger * 100) },
      max_total_cents: Math.round(cap * 100),
      quantity: qty,
      valid_until: new Date(Date.now() + days * 864e5).toISOString(),
    };
    const res = await (await fetch("/api/mandates/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (res.error) {
      setNeedsPasskey(res.error.code === "REG_FAILED");
      setErr(res.error.code === "REG_FAILED" ? "You need a passkey before you can sign a mandate." : `${res.error.code}: ${res.error.message}`);
      setPhase("error");
      return;
    }
    setDraft(res);
    setPhase("review");
  }

  async function sign() {
    if (!draft) return;
    setPhase("signing");
    setErr("");
    try {
      const assertion = await startAuthentication({ optionsJSON: draft.webauthn as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      const res = await (await fetch(`/api/mandates/${draft.mandate.id}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assertion }) })).json();
      if (res.error) {
        setErr(`${res.error.code}: ${res.error.message}`);
        setPhase("error");
        return;
      }
      setPhase("signed");
    } catch (e) {
      setErr((e as Error).message);
      setPhase("error");
    }
  }

  async function arm() {
    if (!draft) return;
    setPhase("arming");
    setArmMsg("Opening Prava approval…");
    const res = await (await fetch(`/api/mandates/${draft.mandate.id}/arm`, { method: "POST" })).json();
    if (res.error || !res.approval_url) {
      setErr(res.error ? `${res.error.code}: ${res.error.message}` : "could not start arming");
      setPhase("error");
      return;
    }
    window.open(res.approval_url, "_blank", "noopener"); // approve card + passkey on Prava's surface
    setArmMsg("Approve the mandate on Prava (opened in a new tab). Waiting for it to go active…");
    // poll confirm-arm until active (~2 min budget)
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const c = await (await fetch(`/api/mandates/${draft.mandate.id}/confirm-arm`, { method: "POST" })).json();
      if (c.status === "armed") {
        setPhase("armed");
        return;
      }
    }
    setArmMsg("Still not active. Approve on Prava, then click ‘Check again’.");
  }

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl bg-white px-4 py-10 text-[#0a0a0a] sm:px-6 sm:py-14 lg:py-16">
      <p className="num text-xs font-medium uppercase tracking-[0.2em] text-[#6b7280]">S1 · Create</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Sign a conditional mandate</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-6 text-[#5f5f5f] sm:text-base">Commit once. It executes only when your condition fires — and can never exceed what you sign.</p>
      <a href="/setup" className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[#d7d9df] bg-white px-4 py-2 text-[13px] font-medium text-[#30343b] transition-colors hover:border-[#0a0a0a] hover:text-[#0a0a0a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">
        ◉ First time? Set up your passkey first →
      </a>

      {(phase === "form" || phase === "drafting" || phase === "error") && (
        <div className="mt-8 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-5 sm:p-6">
          <label className="mb-4 block">
            <span className="text-[13px] font-medium text-[#45515e]">Merchant</span>
            <select
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              className="mt-2 min-h-11 w-full rounded-lg border border-[#d7d9df] bg-white px-3 py-2 text-[14px] text-[#0a0a0a] outline-none transition-colors focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#1d4ed8]/15"
            >
              <option value="wavelength">Wavelength (demo merchant)</option>
              <option value="amazon" disabled>Amazon — coming soon</option>
              <option value="flipkart" disabled>Flipkart — coming soon</option>
              <option value="apple" disabled>Apple — coming soon</option>
            </select>
          </label>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <NumField label="Buy if price below" prefix="$" value={trigger} onChange={setTrigger} />
            <NumField label="Max total (cap)" prefix="$" value={cap} onChange={setCap} />
            <NumField label="Quantity" value={qty} onChange={setQty} min={1} max={10} />
            <NumField label="Valid for (days)" value={days} onChange={setDays} min={1} max={7} />
          </div>
          <label className="mt-4 block">
            <span className="text-[13px] font-medium text-[#45515e]">Or describe it in your own words</span>
            <input value={utterance} onChange={(e) => setUtterance(e.target.value)} placeholder="Buy AirPods under $180 within 3 days" className="mt-2 min-h-11 w-full rounded-lg border border-[#d7d9df] bg-white px-3 py-2 text-[14px] text-[#0a0a0a] outline-none transition-colors placeholder:text-[#8a9099] focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#1d4ed8]/15" />
          </label>
          <div className="mt-5 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[13px] leading-5 text-[#5f5f5f]">
            AirPods Pro · Wavelength — buy <b className="text-[#0a0a0a]">1</b> if the price drops under <b className="text-strike">{usd(Math.round(trigger * 100))}</b>, spending at most <b className="text-[#0a0a0a]">{usd(Math.round(cap * 100))}</b>, within {days} days.
          </div>
          <button onClick={makeDraft} disabled={phase === "drafting"} aria-busy={phase === "drafting"} className="mt-5 min-h-12 w-full rounded-full bg-[#0a0a0a] px-5 py-3 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-[#242424] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#d7d9df] disabled:text-[#777d86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">
            {phase === "drafting" ? "Parsing…" : "Review scope"}
          </button>
          {phase === "error" && (
            <div className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4" role="alert">
              <p className="text-[13px] leading-5 text-danger">{err}</p>
              {needsPasskey && (
                <a href="/setup" className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-center text-[14px] font-semibold text-white transition-colors hover:bg-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">
                  ◉  Set up your passkey →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {(phase === "review" || phase === "signing") && draft && (
        <div className="mt-8" aria-live="polite">
          <ScopeCard z={draft.signed_zone} hash={draft.mandate_hash} />
          <p className="mt-3 text-center text-[12px] leading-5 text-[#6b7280]">What you see is what you sign — this exact scope is hashed and covered by your passkey.</p>
          <button onClick={sign} disabled={phase === "signing"} aria-busy={phase === "signing"} className="mt-4 min-h-12 w-full rounded-full bg-[#0a0a0a] px-5 py-3 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-[#242424] active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#d7d9df] disabled:text-[#777d86] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">
            {phase === "signing" ? "Waiting for Touch ID…" : "◉  Sign with Touch ID"}
          </button>
        </div>
      )}

      {(phase === "signed" || phase === "arming") && draft && (
        <div className="mt-8" aria-live="polite">
          <div className="rounded-2xl border border-strike/30 bg-strike/5 p-6">
            <div className="num text-xs font-medium uppercase tracking-[0.2em] text-strike">signed</div>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">Mandate signed ✓</h2>
            <p className="mt-2 text-[14px] leading-6 text-[#5f5f5f]">Your passkey signature is bound to the exact scope. One more step: authorize the payment on Prava (a scoped, one-time mandate).</p>
          </div>
          {phase === "signed" ? (
            <button onClick={arm} className="mt-4 min-h-12 w-full rounded-full bg-[#0a0a0a] px-5 py-3 text-[15px] font-semibold text-white transition-[background-color,transform] hover:bg-[#242424] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">◉  Arm on Prava →</button>
          ) : (
            <div className="mt-4 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-5 text-center">
              <p className="text-[14px] leading-6 text-[#30343b]">{armMsg}</p>
              <button onClick={arm} className="mt-3 min-h-11 rounded-full border border-[#d7d9df] bg-white px-4 py-2 text-[13px] font-medium text-[#17437d] transition-colors hover:border-[#17437d] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">Check again</button>
            </div>
          )}
        </div>
      )}

      {phase === "armed" && draft && (
        <div className="mt-8 rounded-2xl border border-strike/30 bg-strike/5 p-6 text-center" aria-live="polite">
          <div className="num text-xs font-medium uppercase tracking-[0.2em] text-strike">armed</div>
          <h2 className="mt-3 text-2xl font-semibold tracking-[-0.025em]">Armed — watching ✓</h2>
          <p className="mx-auto mt-2 max-w-lg text-[14px] leading-6 text-[#5f5f5f]">No card is on file anywhere. Strike is watching the price; it executes the instant your condition fires.</p>
          <a href={`/m/${draft.mandate.id}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">View live →</a>
        </div>
      )}

      {phase === "error" && draft && <p className="mt-4 rounded-xl border border-danger/30 bg-danger/5 p-4 text-center text-[13px] text-danger" role="alert">{err}</p>}
    </main>
  );
}

function NumField({ label, prefix, value, onChange, min = 0, max = 100000 }: { label: string; prefix?: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-[13px] font-medium text-[#45515e]">{label}</span>
      <div className="mt-2 flex min-h-11 items-center rounded-lg border border-[#d7d9df] bg-white px-3 py-2 transition-colors focus-within:border-[#1d4ed8] focus-within:ring-2 focus-within:ring-[#1d4ed8]/15">
        {prefix && <span className="mr-1 text-[#6b7280]">{prefix}</span>}
        <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} className="num w-full bg-transparent text-[15px] text-[#0a0a0a] outline-none" />
      </div>
    </label>
  );
}

function ScopeCard({ z, hash }: { z: SignedZone; hash: string }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-5 sm:p-6">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={z.item.image_url} width={44} height={44} alt={z.item.display_name} className="rounded-xl border border-[#e5e7eb] bg-white object-cover" />
        <div>
          <div className="text-[15px] font-semibold text-[#0a0a0a]">{z.item.display_name}</div>
          <div className="mt-0.5 text-xs text-[#6b7280]">{z.merchant.name} · {z.merchant.country}</div>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-[#e5e7eb] pt-5 sm:grid-cols-2 sm:gap-y-5">
        <Field k="Condition" v={`price < ${usd(z.condition.price_cents)}`} accent />
        <Field k="Max total" v={usd(z.max_total_cents)} />
        <Field k="Quantity" v={String(z.quantity)} />
        <Field k="Currency" v={z.currency} />
        <Field k="Valid until" v={new Date(z.valid_until).toLocaleString()} />
        <Field k="Mode" v={z.mode.replace("_", "-")} />
      </dl>
      <div className="mt-5 border-t border-[#e5e7eb] pt-4">
        <div className="num text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">mandate hash · sha-256(JCS)</div>
        <div className="num mt-1.5 break-all text-[11px] leading-5 text-[#6b7280]">{hash}</div>
      </div>
    </div>
  );
}

function Field({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">{k}</dt>
      <dd className={`num mt-1 text-[15px] ${accent ? "text-strike" : "text-[#0a0a0a]"}`}>{v}</dd>
    </div>
  );
}
