"use client";
// S3 · Mandate detail (Doc 5). The one thing: the live Timeline — the audit log rendered honestly.
// During execution it cascades TRIGGERED → charge → token → PAID, each row green as it lands.
import { use, useEffect, useState } from "react";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

type Ev = { seq: number; event_type: string; actor: string; payload: Record<string, unknown>; created_at: string };
type Detail = {
  mandate: {
    id: string; status: string;
    merchant: { name: string; country: string };
    item: { display_name: string; image_url: string };
    condition: { type: string; price_cents: number };
    max_total_cents: number; quantity: number; currency: string;
    valid_until: string; mandate_hash: string; armed_on_prava: boolean;
    demo_decline_available: boolean;
  };
  execution: { quote_total_cents: number | null; prava_transaction_id: string | null; store_order_id: string | null; outcome: string | null; failure_reason: string | null } | null;
  latest_price: { price_cents: number; in_stock: boolean; observed_at: string } | null;
  events: Ev[];
  narration?: string;
};

const MONEY = new Set(["armed", "triggered", "executing", "fulfilled"]);
const BAD = new Set(["failed", "revoked"]);
const WARN = new Set(["expired"]);

function badgeClass(status: string) {
  if (status === "fulfilled") return "bg-strike/15 text-strike ring-strike/40";
  if (MONEY.has(status)) return "bg-strike/10 text-strike ring-strike/30";
  if (BAD.has(status)) return "bg-danger/10 text-danger ring-danger/30";
  if (WARN.has(status)) return "bg-warn/10 text-warn ring-warn/30";
  return "bg-line/40 text-muted ring-line";
}

// state name → UI copy (Doc: STRUCK is UI copy; the state is `triggered`)
const LABEL: Record<string, string> = {
  MANDATE_DRAFTED: "Drafted", MANDATE_SIGNED: "Signed with passkey", MANDATE_ARMED: "Armed — watching",
  CONDITION_TRIGGERED: "STRUCK — condition met", EXECUTION_STARTED: "Execution started",
  PRAVA_CALL: "Prava — token minted", EXECUTION_FULFILLED: "PAID", EXECUTION_ABORTED: "Aborted — re-armed",
  EXECUTION_FAILED: "Failed", MANDATE_EXPIRED: "Expired", MANDATE_REVOKED: "Revoked", RECOVERY_ACTION: "Recovered",
};
const GREEN_EV = new Set(["MANDATE_ARMED", "CONDITION_TRIGGERED", "PRAVA_CALL", "EXECUTION_FULFILLED"]);
const RED_EV = new Set(["EXECUTION_FAILED", "MANDATE_REVOKED"]);
const AMBER_EV = new Set(["EXECUTION_ABORTED", "MANDATE_EXPIRED"]);

function evColor(t: string) {
  if (t === "EXECUTION_FULFILLED") return "text-strike";
  if (GREEN_EV.has(t)) return "text-strike";
  if (RED_EV.has(t)) return "text-danger";
  if (AMBER_EV.has(t)) return "text-warn";
  return "text-ink";
}
function evDot(t: string) {
  if (GREEN_EV.has(t)) return "bg-strike";
  if (RED_EV.has(t)) return "bg-danger";
  if (AMBER_EV.has(t)) return "bg-warn";
  return "bg-line";
}

function evDetail(e: Ev): string {
  const p = e.payload;
  if (e.event_type === "CONDITION_TRIGGERED") {
    const s = p.snapshot as { price_cents?: number } | undefined;
    return s?.price_cents != null ? `observed ${usd(s.price_cents)}` : "";
  }
  if (e.event_type === "PRAVA_CALL") return typeof p.transaction_id === "string" ? String(p.transaction_id) : "";
  if (e.event_type === "EXECUTION_FULFILLED") {
    const amt = typeof p.amount_cents === "number" ? usd(p.amount_cents) : "";
    const l4 = typeof p.token_last4 === "string" ? ` · card ••••${p.token_last4}` : "";
    return `${amt}${l4}`;
  }
  if (e.event_type === "EXECUTION_ABORTED" || e.event_type === "EXECUTION_FAILED") return String(p.reason ?? p.detail ?? "");
  return "";
}

export default function MandateDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [d, setD] = useState<Detail | null>(null);
  const [err, setErr] = useState("");
  const [action, setAction] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetch(`/api/mandates/${id}`, { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        if (j.error) setErr(j.error.message);
        else { setD(j); setErr(""); }
      } catch { /* keep last good state */ }
    };
    poll();
    const t = setInterval(poll, 2000); // Doc 5 A1: 2s cursor poll drives all live screens
    return () => { alive = false; clearInterval(t); };
  }, [id]);

  if (err) return <main className="mx-auto max-w-2xl px-6 py-16"><p className="text-danger">{err}</p></main>;
  if (!d) return <main className="mx-auto max-w-2xl px-6 py-16"><p className="text-muted">Loading…</p></main>;

  const { mandate: m } = d;
  const price = d.latest_price?.price_cents ?? null;
  const belowCap = price != null && price < m.condition.price_cents;

  async function revoke() {
    setActionBusy(true);
    const res = await fetch(`/api/mandates/${id}/revoke`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setAction(json.error ? `${json.error.code}: ${json.error.message}` : "Mandate revoked. Strike will not issue another charge.");
    setActionBusy(false);
  }

  async function demonstrateDecline() {
    setActionBusy(true);
    const res = await fetch(`/api/mandates/${id}/demo-decline`, { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setAction(json.error ? `${json.error.code}: ${json.error.message}` : "Prava returned a real network refusal.");
    setActionBusy(false);
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <p className="num text-xs uppercase tracking-[0.2em] text-muted">S3 · Mandate</p>
      <div className="mt-3 flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.item.image_url} width={52} height={52} alt="" className="rounded bg-white/5" />
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{m.item.display_name}</h1>
            <span className={`num rounded px-2 py-0.5 text-[11px] uppercase tracking-wider ring-1 ring-inset ${badgeClass(m.status)}`}>
              {m.status === "triggered" ? "struck" : m.status}
            </span>
          </div>
          <p className="text-[13px] text-muted">{m.merchant.name} · buy if price &lt; {usd(m.condition.price_cents)} · cap {usd(m.max_total_cents)} · qty {m.quantity}</p>
        </div>
      </div>

      {/* live price ticker vs cap */}
      <div className="mt-6 flex items-end gap-6 rounded-card border border-line bg-surface px-5 py-4">
        <div>
          <div className="num text-[11px] uppercase tracking-wider text-muted">live price</div>
          <div className={`num text-[40px] leading-none ${belowCap ? "text-strike" : "text-ink"}`}>{price != null ? usd(price) : "—"}</div>
        </div>
        <div className="pb-1">
          <div className="num text-[11px] uppercase tracking-wider text-muted">your trigger</div>
          <div className="num text-[18px] text-muted">&lt; {usd(m.condition.price_cents)}</div>
        </div>
        {d.latest_price && !d.latest_price.in_stock && <div className="num pb-1 text-[12px] text-warn">out of stock</div>}
      </div>

      {m.status === "failed" && (
        <section className="mt-5 rounded-card border border-danger/40 bg-danger/5 p-4" role="alert">
          <div className="num text-[11px] uppercase tracking-[0.18em] text-danger">Network declined</div>
          <h2 className="mt-1 text-[15px] font-semibold text-danger">Prava refused this charge</h2>
          <p className="mt-1 text-[13px] text-muted">{d.execution?.failure_reason ?? "The payment network refused to issue a credential outside the mandate."}</p>
        </section>
      )}

      {d.narration && <p className="mt-4 text-[14px] text-muted">{d.narration}</p>}

      {(m.status === "armed" || m.status === "triggered" || m.status === "executing") && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button onClick={revoke} disabled={actionBusy} className="rounded border border-danger/40 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50">
            {actionBusy ? "Working…" : "Revoke mandate"}
          </button>
          {m.demo_decline_available && m.status === "armed" && (
            <button onClick={demonstrateDecline} disabled={actionBusy || !belowCap} className="rounded border border-danger/40 px-3 py-2 text-[13px] font-medium text-danger hover:bg-danger/10 disabled:opacity-50">
              Prove network cap
            </button>
          )}
          {m.demo_decline_available && m.status === "armed" && !belowCap && <span className="text-[12px] text-muted">Drop the price below the trigger to run the decline proof.</span>}
          {action && <span className="text-[12px] text-muted">{action}</span>}
        </div>
      )}

      {/* timeline — the cascade */}
      <h2 className="mt-8 num text-[11px] uppercase tracking-[0.2em] text-muted">Audit timeline</h2>
      <ol className="mt-3 border-l border-line">
        {d.events.map((e) => {
          const detail = evDetail(e);
          return (
            <li key={e.seq} className="relative py-3 pl-6">
              <span className={`absolute -left-[5px] top-4 h-[9px] w-[9px] rounded-full ${evDot(e.event_type)}`} />
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-[14px] font-medium ${evColor(e.event_type)}`}>
                  {LABEL[e.event_type] ?? e.event_type}
                  {e.event_type === "EXECUTION_FULFILLED" && detail ? ` ${detail.split(" · ")[0]}` : ""}
                </span>
                <span className="num shrink-0 text-[11px] text-muted">{new Date(e.created_at).toLocaleTimeString()}</span>
              </div>
              {detail && e.event_type !== "EXECUTION_FULFILLED" && <div className="num mt-0.5 text-[12px] text-muted">{detail}</div>}
              {e.event_type === "EXECUTION_FULFILLED" && detail.includes("••••") && <div className="num mt-0.5 text-[12px] text-muted">{detail.split(" · ")[1]}</div>}
              <div className="num mt-0.5 text-[10px] uppercase tracking-wider text-muted/70">{e.actor}</div>
            </li>
          );
        })}
      </ol>

      {d.execution?.store_order_id && (
        <p className="num mt-6 text-[12px] text-muted">Wavelength order {d.execution.store_order_id}</p>
      )}
      {m.status === "fulfilled" && (
        <a href={`/m/${id}/receipt`} className="mt-5 inline-block text-[13px] text-link hover:underline">View verifiable receipt →</a>
      )}
      <div className="num mt-6 break-all border-t border-line pt-4 text-[10px] text-muted/70">hash {m.mandate_hash}</div>
    </main>
  );
}
