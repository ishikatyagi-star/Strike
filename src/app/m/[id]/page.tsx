"use client";
// S3 · Mandate detail (Doc 5). The one thing: the live Timeline — the audit log rendered honestly.
// During execution it cascades TRIGGERED → charge → token → PAID, each row green as it lands.
import { use, useEffect, useState } from "react";
import { previewPrice } from "@/app/_components/guided-demo";

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
  return "bg-[#eef0f3] text-[#5f5f5f] ring-[#d7d9df]";
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

function pravaRefused(e: Ev) {
  return e.event_type === "PRAVA_CALL" && e.payload.status === "failed";
}
function evColor(e: Ev) {
  if (pravaRefused(e)) return "text-danger";
  if (e.event_type === "EXECUTION_FULFILLED") return "text-strike";
  if (GREEN_EV.has(e.event_type)) return "text-strike";
  if (RED_EV.has(e.event_type)) return "text-danger";
  if (AMBER_EV.has(e.event_type)) return "text-warn";
  return "text-[#0a0a0a]";
}
function evDot(e: Ev) {
  if (pravaRefused(e)) return "bg-danger";
  if (GREEN_EV.has(e.event_type)) return "bg-strike";
  if (RED_EV.has(e.event_type)) return "bg-danger";
  if (AMBER_EV.has(e.event_type)) return "bg-warn";
  return "bg-[#a8adb5]";
}

function evLabel(e: Ev) {
  if (pravaRefused(e)) return "Prava — charge refused";
  return LABEL[e.event_type] ?? e.event_type;
}

function evDetail(e: Ev): string {
  const p = e.payload;
  if (e.event_type === "CONDITION_TRIGGERED") {
    const s = p.snapshot as { price_cents?: number } | undefined;
    return s?.price_cents != null ? `observed ${usd(s.price_cents)}` : "";
  }
  if (e.event_type === "PRAVA_CALL") return typeof p.error === "string" ? p.error : typeof p.transaction_id === "string" ? String(p.transaction_id) : "";
  if (e.event_type === "EXECUTION_FULFILLED") {
    const amt = typeof p.amount_cents === "number" ? usd(p.amount_cents) : "";
    const l4 = typeof p.token_last4 === "string" ? ` · card ••••${p.token_last4}` : "";
    return `${amt}${l4}`;
  }
  if (e.event_type === "EXECUTION_ABORTED" || e.event_type === "EXECUTION_FAILED") return String(p.reason ?? p.detail ?? "");
  return "";
}

function evExplanation(e: Ev) {
  if (pravaRefused(e)) {
    const error = String(e.payload.error ?? "").toUpperCase();
    return error.includes("THRESHOLD_EXCEEDED") || error.includes("EXCEEDS THRESHOLD")
      ? "Prava/Visa refused an amount outside the signed limit."
      : "Prava refused the charge; its returned error is shown below.";
  }
  return ({
    MANDATE_DRAFTED: "Strike prepared the rule for review. Nothing was signed or spendable yet.",
    MANDATE_SIGNED: "The owner passkey signed the exact merchant, trigger, cap, quantity, and expiry.",
    MANDATE_ARMED: "Strike is watching Wavelength.",
    CONDITION_TRIGGERED: "Wavelength crossed your target price.",
    EXECUTION_STARTED: "Strike rechecked your signed rule.",
    PRAVA_CALL: "Prava issued a one-time payment credential.",
    EXECUTION_FULFILLED: "Wavelength confirmed the order.",
    EXECUTION_ABORTED: "The market changed during execution. No payment completed.",
    EXECUTION_FAILED: "The execution ended without a purchase.",
    MANDATE_EXPIRED: "The signed time window closed before a valid purchase completed.",
    MANDATE_REVOKED: "The owner ended this mandate; it cannot execute again.",
    RECOVERY_ACTION: "Strike recovered an interrupted execution without fabricating a purchase result.",
  } as Record<string, string>)[e.event_type] ?? "This is a real event returned by the append-only audit.";
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

  if (err) return <main className="mx-auto min-h-[100dvh] max-w-3xl bg-white px-4 py-12 text-[#0a0a0a] sm:px-6 sm:py-16"><p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-danger" role="alert">{err}</p></main>;
  if (!d) return <main className="mx-auto min-h-[100dvh] max-w-3xl bg-white px-4 py-12 text-[#0a0a0a] sm:px-6 sm:py-16"><p className="text-[#6b7280]" role="status">Loading…</p></main>;

  const { mandate: m } = d;
  const price = d.latest_price?.price_cents ?? null;
  const livePreview = price == null ? null : previewPrice(price, m.condition.price_cents, m.max_total_cents, m.quantity);
  const conditionMet = livePreview != null && livePreview.outcome !== "watching";
  const declineProofReady = livePreview?.outcome === "protected";
  const fulfilled = d.events.some((event) => event.event_type === "EXECUTION_FULFILLED");
  const declined = d.events.some(pravaRefused);
  const latestAbort = [...d.events].reverse().find((event) => event.event_type === "EXECUTION_ABORTED");
  const safelyStopped = !fulfilled && !declined && m.status === "armed" && !!latestAbort;
  const hasPaymentEvent = d.events.some((event) => event.event_type === "PRAVA_CALL" || event.event_type === "EXECUTION_FULFILLED");

  async function revoke() {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/mandates/${id}/revoke`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setAction(json.error ? `${json.error.code}: ${json.error.message}` : "Mandate revoked. Strike will not issue another charge.");
    } catch {
      setAction("UNAVAILABLE: Strike could not revoke this mandate.");
    } finally {
      setActionBusy(false);
    }
  }

  async function demonstrateDecline() {
    setActionBusy(true);
    try {
      const res = await fetch(`/api/mandates/${id}/demo-decline`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      const result = json.result as { ok?: boolean; outcome?: string; reason?: string } | undefined;
      setAction(json.error
        ? `${json.error.code}: ${json.error.message}`
        : result?.ok
          ? "The charge completed inside the signed limit; no network refusal occurred."
          : `The proof ended with ${result?.outcome ?? result?.reason ?? "an unknown result"}. Check the returned timeline.`);
    } catch {
      setAction("UNAVAILABLE: Strike could not run the network-limit proof.");
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-4xl bg-white px-4 py-10 text-[#0a0a0a] sm:px-6 sm:py-14 lg:py-16">
      <p className="num text-xs font-medium uppercase tracking-[0.2em] text-[#6b7280]">S3 · Mandate</p>
      <div className="mt-5 flex items-start gap-4 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-4 sm:p-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={m.item.image_url} width={52} height={52} alt={m.item.display_name} className="rounded-xl border border-[#e5e7eb] bg-white object-cover" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-[-0.025em] sm:text-2xl">{m.item.display_name}</h1>
            <span className={`num rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider ring-1 ring-inset ${badgeClass(m.status)}`}>
              {m.status === "triggered" ? "struck" : m.status}
            </span>
          </div>
          <p className="mt-1 text-[13px] leading-5 text-[#5f5f5f]">{m.merchant.name} · buy if price &lt; {usd(m.condition.price_cents)} · cap {usd(m.max_total_cents)} · qty {m.quantity}</p>
        </div>
      </div>

      {/* live price ticker vs cap */}
      <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4 rounded-2xl border border-[#e5e7eb] bg-white px-5 py-5 sm:px-6" aria-live="polite">
        <div>
          <div className="num text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">live price</div>
          <div className={`num mt-1 text-[40px] font-medium leading-none tracking-[-0.04em] sm:text-[44px] ${conditionMet ? "text-strike" : "text-[#0a0a0a]"}`}>{price != null ? usd(price) : "—"}</div>
        </div>
        <div className="pb-1">
          <div className="num text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">your trigger</div>
          <div className="num mt-1 text-[18px] text-[#45515e]">&lt; {usd(m.condition.price_cents)}</div>
        </div>
        {d.latest_price && !d.latest_price.in_stock && <div className="num rounded-full bg-warn/10 px-2.5 py-1 text-[12px] text-warn">out of stock</div>}
      </div>

      {fulfilled && (
        <section className="mt-5 rounded-2xl border border-strike/30 bg-strike/5 p-5" role="status">
          <div className="num text-[11px] font-medium uppercase tracking-[0.18em] text-strike">Paid and confirmed</div>
          <h2 className="mt-2 text-[16px] font-semibold text-strike">The signed rule completed inside its boundary</h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">The result comes from the returned EXECUTION_FULFILLED event.</p>
        </section>
      )}
      {safelyStopped && (
        <section className="mt-5 rounded-2xl border border-warn/30 bg-warn/5 p-5" role="status">
          <div className="num text-[11px] font-medium uppercase tracking-[0.18em] text-warn">Safely stopped</div>
          <h2 className="mt-2 text-[16px] font-semibold text-warn">Execution stopped safely. Strike is watching again.</h2>
          <p className="mt-1 text-[13px] leading-5 text-muted">The returned EXECUTION_ABORTED event reports {String(latestAbort?.payload.reason ?? "a changed market condition").replaceAll("_", " ")}.</p>
        </section>
      )}
      {declined && (
        <section className="mt-5 rounded-2xl border border-danger/30 bg-danger/5 p-5" role="alert">
          <div className="num text-[11px] font-medium uppercase tracking-[0.18em] text-danger">Network declined</div>
          <h2 className="mt-2 text-[15px] font-semibold text-danger">Prava refused this charge</h2>
          <p className="mt-1 text-[13px] leading-5 text-[#5f5f5f]">{d.execution?.failure_reason ?? "The payment network refused to issue a credential outside the mandate."}</p>
        </section>
      )}

      {d.narration && <p className="mt-4 text-[14px] leading-6 text-[#5f5f5f]">{d.narration}</p>}

      {(m.status === "armed" || m.status === "triggered" || m.status === "executing") && (
        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-[#e5e7eb] bg-[#f7f8fa] p-4" aria-live="polite">
          <button onClick={revoke} disabled={actionBusy} aria-busy={actionBusy} className="min-h-11 rounded-full border border-danger/40 bg-white px-4 py-2 text-[13px] font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">
            {actionBusy ? "Working…" : "Revoke mandate"}
          </button>
          {m.demo_decline_available && m.status === "armed" && declineProofReady && (
            <button onClick={demonstrateDecline} disabled={actionBusy} aria-busy={actionBusy} className="min-h-11 rounded-full border border-danger/40 bg-white px-4 py-2 text-[13px] font-medium text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">
              Prove network limit
            </button>
          )}
          {m.demo_decline_available && m.status === "armed" && !conditionMet && <span className="text-[12px] leading-5 text-[#6b7280]">Drop the price below the trigger to run the decline proof.</span>}
          {m.demo_decline_available && m.status === "armed" && conditionMet && !declineProofReady && <span className="text-[12px] leading-5 text-[#6b7280]">This live total is inside the signed cap, so the network-limit proof is unavailable.</span>}
          {action && <span className="text-[12px] leading-5 text-[#6b7280]">{action}</span>}
        </div>
      )}

      {/* timeline — the cascade */}
      <h2 className="mt-9 num text-[11px] font-medium uppercase tracking-[0.2em] text-[#6b7280]">Audit timeline</h2>
      {m.status === "armed" && !hasPaymentEvent && <p className="mt-4 rounded-2xl border border-strike/25 bg-strike/5 px-4 py-3 text-[13px] leading-5 text-strike" role="status">Still watching. {conditionMet ? "The condition is true, but no payment was attempted." : "The condition is not true yet. No payment was attempted."}</p>}
      <ol className="boundary-rail mt-4 overflow-hidden bg-white px-5 shadow-none sm:px-6">
        {d.events.map((e) => {
          const detail = evDetail(e);
          return (
            <li key={e.seq} className="relative border-b border-[#eceef1] py-4 pl-7 last:border-b-0">
              <span aria-hidden="true" className={`absolute left-0 top-5 h-[9px] w-[9px] rounded-full ${evDot(e)}`} />
              <div className="flex items-baseline justify-between gap-3">
                <span className={`text-[14px] font-medium ${evColor(e)}`}>
                  {evLabel(e)}
                  {e.event_type === "EXECUTION_FULFILLED" && detail ? ` ${detail.split(" · ")[0]}` : ""}
                </span>
                <span className="num shrink-0 text-[11px] text-[#6b7280]">{new Date(e.created_at).toLocaleTimeString()}</span>
              </div>
              <p className="mt-1 text-[12px] leading-5 text-muted">{evExplanation(e)}</p>
              {detail && e.event_type !== "EXECUTION_FULFILLED" && <div className="num mt-1 text-[12px] leading-5 text-[#6b7280]">{detail}</div>}
              {e.event_type === "EXECUTION_FULFILLED" && detail.includes("••••") && <div className="num mt-1 text-[12px] leading-5 text-[#6b7280]">{detail.split(" · ")[1]}</div>}
              <div className="num mt-1 text-[10px] font-medium uppercase tracking-wider text-[#8a9099]">{e.event_type} · {e.actor}</div>
            </li>
          );
        })}
      </ol>

      {d.execution?.store_order_id && (
        <p className="num mt-6 text-[12px] text-[#6b7280]">Wavelength order {d.execution.store_order_id}</p>
      )}
      {m.status === "fulfilled" && (
        <a href={`/m/${id}/receipt`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#242424] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">View verifiable receipt →</a>
      )}
      <div className="num mt-8 break-all border-t border-[#e5e7eb] pt-4 text-[10px] leading-5 text-[#8a9099]">hash {m.mandate_hash}</div>
    </main>
  );
}
