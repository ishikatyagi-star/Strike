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
  const [trigger, setTrigger] = useState(180);
  const [cap, setCap] = useState(180);
  const [qty, setQty] = useState(1);
  const [days, setDays] = useState(3);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState("");
  const [armMsg, setArmMsg] = useState("");

  async function makeDraft() {
    setPhase("drafting");
    setErr("");
    const body = {
      merchant_id: "wavelength",
      item_sku: "airpods-pro",
      condition: { type: "price_below", price_cents: Math.round(trigger * 100) },
      max_total_cents: Math.round(cap * 100),
      quantity: qty,
      valid_until: new Date(Date.now() + days * 864e5).toISOString(),
    };
    const res = await (await fetch("/api/mandates/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json();
    if (res.error) {
      setErr(res.error.code === "REG_FAILED" ? "Register a passkey on /setup first." : `${res.error.code}: ${res.error.message}`);
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
    <main className="mx-auto w-full max-w-xl px-6 py-16">
      <p className="num text-xs uppercase tracking-[0.2em] text-muted">S1 · Create</p>
      <h1 className="mt-2 text-2xl font-semibold">Sign a conditional mandate</h1>
      <p className="mt-1 text-[15px] text-muted">Commit once. It executes only when your condition fires — and can never exceed what you sign.</p>

      {(phase === "form" || phase === "drafting" || phase === "error") && (
        <div className="mt-8 rounded-card border border-line bg-surface p-5">
          <div className="grid grid-cols-2 gap-4">
            <NumField label="Buy if price below" prefix="$" value={trigger} onChange={setTrigger} />
            <NumField label="Max total (cap)" prefix="$" value={cap} onChange={setCap} />
            <NumField label="Quantity" value={qty} onChange={setQty} min={1} max={10} />
            <NumField label="Valid for (days)" value={days} onChange={setDays} min={1} max={7} />
          </div>
          <div className="mt-3 text-[13px] text-muted">
            AirPods Pro · Wavelength — buy <b className="text-ink">1</b> if the price drops under <b className="text-strike">{usd(Math.round(trigger * 100))}</b>, spending at most <b className="text-ink">{usd(Math.round(cap * 100))}</b>, within {days} days.
          </div>
          <button onClick={makeDraft} disabled={phase === "drafting"} className="mt-5 w-full rounded bg-strike/10 py-3 text-[15px] font-semibold text-strike ring-1 ring-inset ring-strike/30 hover:bg-strike/15 disabled:opacity-50">
            {phase === "drafting" ? "Preparing…" : "Review scope"}
          </button>
          {phase === "error" && <p className="mt-3 text-[13px] text-danger">{err}</p>}
        </div>
      )}

      {(phase === "review" || phase === "signing") && draft && (
        <div className="mt-8">
          <ScopeCard z={draft.signed_zone} hash={draft.mandate_hash} />
          <p className="mt-3 text-center text-[12px] text-muted">What you see is what you sign — this exact scope is hashed and covered by your passkey.</p>
          <button onClick={sign} disabled={phase === "signing"} className="mt-4 w-full rounded bg-ink py-3 text-[15px] font-semibold text-bg hover:opacity-90 disabled:opacity-60">
            {phase === "signing" ? "Waiting for Touch ID…" : "◉  Sign with Touch ID"}
          </button>
        </div>
      )}

      {(phase === "signed" || phase === "arming") && draft && (
        <div className="mt-8">
          <div className="rounded-card border border-strike/40 bg-strike/5 p-6 text-center">
            <div className="num text-xs uppercase tracking-[0.2em] text-strike">signed</div>
            <h2 className="mt-2 text-xl font-semibold">Mandate signed ✓</h2>
            <p className="mt-1 text-[14px] text-muted">Your passkey signature is bound to the exact scope. One more step: authorize the payment on Prava (a scoped, one-time mandate).</p>
          </div>
          {phase === "signed" ? (
            <button onClick={arm} className="mt-4 w-full rounded bg-ink py-3 text-[15px] font-semibold text-bg hover:opacity-90">◉  Arm on Prava →</button>
          ) : (
            <div className="mt-4 rounded-card border border-line bg-surface p-5 text-center">
              <p className="text-[14px]">{armMsg}</p>
              <button onClick={arm} className="mt-3 text-[13px] text-link hover:underline">Check again</button>
            </div>
          )}
        </div>
      )}

      {phase === "armed" && draft && (
        <div className="mt-8 rounded-card border border-strike/40 bg-strike/5 p-6 text-center">
          <div className="num text-xs uppercase tracking-[0.2em] text-strike">armed</div>
          <h2 className="mt-2 text-xl font-semibold">Armed — watching ✓</h2>
          <p className="mt-1 text-[14px] text-muted">No card is on file anywhere. Strike is watching the price; it executes the instant your condition fires.</p>
          <a href={`/m/${draft.mandate.id}`} className="mt-4 inline-block rounded bg-ink px-5 py-2.5 text-[14px] font-semibold text-bg hover:opacity-90">View live →</a>
        </div>
      )}

      {phase === "error" && draft && <p className="mt-3 text-center text-[13px] text-danger">{err}</p>}
    </main>
  );
}

function NumField({ label, prefix, value, onChange, min = 0, max = 100000 }: { label: string; prefix?: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <label className="block">
      <span className="text-[12px] text-muted">{label}</span>
      <div className="mt-1 flex items-center rounded border border-line bg-bg px-3 py-2 focus-within:border-strike">
        {prefix && <span className="mr-1 text-muted">{prefix}</span>}
        <input type="number" value={value} min={min} max={max} onChange={(e) => onChange(Number(e.target.value))} className="num w-full bg-transparent text-[15px] outline-none" />
      </div>
    </label>
  );
}

function ScopeCard({ z, hash }: { z: SignedZone; hash: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-5">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={z.item.image_url} width={44} height={44} alt="" className="rounded bg-white/5" />
        <div>
          <div className="text-[15px] font-semibold">{z.item.display_name}</div>
          <div className="text-xs text-muted">{z.merchant.name} · {z.merchant.country}</div>
        </div>
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-y-4">
        <Field k="Condition" v={`price < ${usd(z.condition.price_cents)}`} accent />
        <Field k="Max total" v={usd(z.max_total_cents)} />
        <Field k="Quantity" v={String(z.quantity)} />
        <Field k="Currency" v={z.currency} />
        <Field k="Valid until" v={new Date(z.valid_until).toLocaleString()} />
        <Field k="Mode" v={z.mode.replace("_", "-")} />
      </dl>
      <div className="mt-5 border-t border-line pt-3">
        <div className="num text-[11px] uppercase tracking-wider text-muted">mandate hash · sha-256(JCS)</div>
        <div className="num mt-1 break-all text-[11px] text-muted">{hash}</div>
      </div>
    </div>
  );
}

function Field({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-muted">{k}</dt>
      <dd className={`num mt-0.5 text-[15px] ${accent ? "text-strike" : "text-ink"}`}>{v}</dd>
    </div>
  );
}
