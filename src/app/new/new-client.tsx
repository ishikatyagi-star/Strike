"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useEffect, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { DEMO_PRESETS, resolveExpiry, type DemoScenario, type ExpiryChoice } from "@/app/_components/guided-demo";
import { DemoProgress, TruthLabel } from "@/app/_components/guided-demo-ui";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
type SignedZone = { item: { display_name: string; image_url: string }; merchant: { name: string; country: string }; condition: { type: string; price_cents: number }; max_total_cents: number; quantity: number; currency: string; valid_until: string; mode: string };
type Draft = { mandate: { id: string; status: string }; signed_zone: SignedZone; mandate_hash: string; webauthn: unknown };
type Phase = "form" | "drafting" | "review" | "signing" | "signed" | "arming" | "armed" | "error";
type CatalogProduct = { sku: string; name: string; price_cents: number; verified_checkout: boolean };

const SCENARIOS: { id: DemoScenario; title: string; detail: string }[] = [
  { id: "success", title: "Successful purchase", detail: "$180 trigger · $180 cap" },
  { id: "protection", title: "Test network protection", detail: "$180 trigger · $170 cap" },
  { id: "custom", title: "Choose my own limits", detail: "Choose your trigger and cap" },
];

export function NewMandateClient({ guided, initialScenario }: { guided: boolean; initialScenario: DemoScenario }) {
  const initial = DEMO_PRESETS[initialScenario];
  const [merchant, setMerchant] = useState("wavelength");
  const [scenario, setScenario] = useState(initialScenario);
  const [trigger, setTrigger] = useState(initial.triggerCents / 100);
  const [cap, setCap] = useState(initial.capCents / 100);
  const [qty, setQty] = useState(1);
  const [days, setDays] = useState(3);
  const [expiry, setExpiry] = useState<ExpiryChoice>("3-days");
  const [customDate, setCustomDate] = useState("");
  const [utterance, setUtterance] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [phase, setPhase] = useState<Phase>("form");
  const [err, setErr] = useState("");
  const [needsPasskey, setNeedsPasskey] = useState(false);
  const [armMsg, setArmMsg] = useState("");
  const [approvalUrl, setApprovalUrl] = useState("");
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [checking, setChecking] = useState(false);
  const [pollingTimedOut, setPollingTimedOut] = useState(false);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    if (!guided) return;
    let active = true;
    void fetch("/store/api/catalog", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Live catalogue price is unavailable.");
        const products = await response.json() as CatalogProduct[];
        if (active) setLivePrice(products.find((product) => product.sku === "airpods-pro")?.price_cents ?? null);
      })
      .catch((error) => active && setCatalogError((error as Error).message));
    return () => { active = false; };
  }, [guided]);

  function chooseScenario(next: DemoScenario) {
    const preset = DEMO_PRESETS[next];
    setScenario(next); setTrigger(preset.triggerCents / 100); setCap(preset.capCents / 100);
  }

  async function makeDraft() {
    if (guided && expiry === "date" && !customDate) {
      setErr("Choose a date before reviewing the rule."); setPhase("error"); return;
    }
    setPhase("drafting"); setErr(""); setNeedsPasskey(false);
    const body = utterance.trim() ? { utterance: utterance.trim() } : {
      merchant_id: merchant,
      item_sku: "airpods-pro",
      condition: { type: "price_below", price_cents: Math.round(trigger * 100) },
      max_total_cents: Math.round(cap * 100),
      quantity: qty,
      valid_until: guided ? resolveExpiry(expiry, customDate) : new Date(Date.now() + days * 86_400_000).toISOString(),
    };
    try {
      const response = await fetch("/api/mandates/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json();
      if (result.error) {
        setNeedsPasskey(result.error.code === "REG_FAILED");
        setErr(result.error.code === "REG_FAILED" ? "You need a passkey before you can sign a mandate." : `${result.error.code}: ${result.error.message}`);
        setPhase("error"); return;
      }
      setDraft(result); setPhase("review");
    } catch (error) { setErr((error as Error).message); setPhase("error"); }
  }

  async function sign() {
    if (!draft) return;
    setPhase("signing"); setErr("");
    try {
      const assertion = await startAuthentication({ optionsJSON: draft.webauthn as Parameters<typeof startAuthentication>[0]["optionsJSON"] });
      const response = await fetch(`/api/mandates/${draft.mandate.id}/sign`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assertion }) });
      const result = await response.json();
      if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
      setPhase("signed");
    } catch (error) { setErr((error as Error).message); setPhase("review"); }
  }

  async function confirmOnce() {
    if (!draft) return false;
    const response = await fetch(`/api/mandates/${draft.mandate.id}/confirm-arm`, { method: "POST" });
    const result = await response.json();
    if (result.status === "armed") { setPhase("armed"); return true; }
    if (result.error) throw new Error(`${result.error.code}: ${result.error.message}`);
    return false;
  }

  async function arm() {
    if (!draft) return;
    setPhase("arming"); setErr(""); setPopupBlocked(false); setApprovalUrl(""); setPollingTimedOut(false); setArmMsg("Opening Prava approval…");
    try {
      const response = await fetch(`/api/mandates/${draft.mandate.id}/arm`, { method: "POST" });
      const result = await response.json();
      if (result.error || !result.approval_url) throw new Error(result.error ? `${result.error.code}: ${result.error.message}` : "Could not start Prava approval.");
      setApprovalUrl(result.approval_url);
      const opened = window.open(result.approval_url, "_blank");
      if (opened) opened.opener = null;
      setPopupBlocked(!opened);
      setArmMsg(opened ? "A new Prava tab opened. Approve there, then return here. Waiting for Prava approval…" : "Your browser blocked the Prava tab. Open it with the link below, approve, then return here.");
      for (let attempt = 0; attempt < 60; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        try {
          if (await confirmOnce()) return;
        } catch {
          // A transient Prava check must not restart the arm request or shorten the existing budget.
        }
      }
      setPollingTimedOut(true);
      setArmMsg("Approval is not active yet. Finish in Prava, then check the status once.");
    } catch (error) { setErr((error as Error).message); setPhase("signed"); }
  }

  async function checkApprovalStatus() {
    setChecking(true); setErr("");
    try {
      if (!await confirmOnce()) setArmMsg("Prava has not confirmed the approval yet. Complete it there, then check again.");
    } catch (error) { setErr((error as Error).message); }
    finally { setChecking(false); }
  }

  const guidedStep = ["form", "drafting", "error"].includes(phase) ? 2 : 3;
  const formVisible = ["form", "drafting", "error"].includes(phase) && !draft;

  return <main className="mx-auto min-h-[100dvh] w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10 lg:py-16">
    {guided && <DemoProgress current={guidedStep} />}
    <header className="max-w-3xl">
      <p className="num text-[11px] uppercase tracking-[0.2em] text-muted">{guided ? `Step ${guidedStep} · ${guidedStep === 2 ? "Set the rule" : "Sign and approve"}` : "S1 · Create"}</p>
      <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.03] tracking-[-0.055em]">{guided ? "Define exactly when Strike may buy." : "Sign a conditional mandate"}</h1>
      <p className="mt-5 max-w-2xl text-[15px] leading-7 text-muted">Commit once. Strike can act only inside the trigger, cap, quantity, merchant, and expiry you sign.</p>
      <Link href={guided ? "/setup?guided=1" : "/setup"} className="mt-5 inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-[13px] font-semibold text-ink">First time? Set up your passkey →</Link>
    </header>

    {formVisible && <section className="boundary-rail mt-8 p-5 sm:p-7">
      {guided && <>
        <div className="flex flex-wrap items-center gap-2"><TruthLabel tone="green">Wavelength · demo merchant</TruthLabel><TruthLabel tone="blue">Verified checkout path</TruthLabel><TruthLabel>Live price · {livePrice == null ? "unavailable" : usd(livePrice)}</TruthLabel></div>
        {catalogError && <p className="mt-3 text-[12px] text-warn" role="status">{catalogError} You can still create the signed rule.</p>}
        <fieldset className="mt-6"><legend className="text-[13px] font-semibold">Choose the demonstration</legend><div className="mt-3 grid gap-3 sm:grid-cols-3">{SCENARIOS.map((option) => <button type="button" key={option.id} aria-pressed={scenario === option.id} onClick={() => chooseScenario(option.id)} className={`min-h-24 rounded-2xl border p-4 text-left ${scenario === option.id ? "border-ink bg-ink text-bg" : "border-line bg-white text-ink"}`}><span className="block text-[13px] font-semibold">{option.title}</span><span className={`mt-1 block text-[11px] leading-4 ${scenario === option.id ? "text-white/70" : "text-muted"}`}>{option.detail}</span></button>)}</div></fieldset>
      </>}

      {!guided && <label className="block"><span className="text-[13px] font-semibold">Merchant</span><select value={merchant} onChange={(event) => setMerchant(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3"><option value="wavelength">Wavelength (demo merchant)</option><option value="amazon" disabled>Amazon — coming soon</option><option value="flipkart" disabled>Flipkart — coming soon</option><option value="apple" disabled>Apple — coming soon</option></select></label>}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <NumField label="Buy if unit price is below" prefix="$" value={trigger} onChange={setTrigger} disabled={guided && scenario !== "custom"} />
        <NumField label="Spend no more than" prefix="$" value={cap} onChange={setCap} disabled={guided && scenario !== "custom"} />
        <NumField label="Quantity" value={qty} onChange={setQty} min={1} max={10} />
        {!guided && <NumField label="Valid for (days)" value={days} onChange={setDays} min={1} max={7} />}
      </div>

      {guided && <fieldset className="mt-5"><legend className="text-[13px] font-semibold">Rule expires</legend><div className="mt-2 flex flex-wrap gap-2">{([['today','Today'],['3-days','3 days'],['7-days','7 days'],['date','Choose a date']] as [ExpiryChoice,string][]).map(([value, label]) => <button type="button" key={value} aria-pressed={expiry === value} onClick={() => setExpiry(value)} className={`min-h-11 rounded-full border px-4 text-[12px] font-semibold ${expiry === value ? "border-ink bg-ink text-bg" : "border-line bg-white"}`}>{label}</button>)}</div>{expiry === "date" && <label className="mt-3 block"><span className="sr-only">Custom expiry date</span><input type="date" value={customDate} onChange={(event) => setCustomDate(event.target.value)} className="min-h-11 rounded-xl border border-line bg-white px-3" /></label>}</fieldset>}

      <label className="mt-5 block"><span className="text-[13px] font-semibold">Or describe it in your own words</span><input value={utterance} onChange={(event) => setUtterance(event.target.value)} placeholder="Buy AirPods under $180 within 3 days" className="mt-2 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-[14px] placeholder:text-muted" /><span className="mt-1 block text-[11px] leading-4 text-muted">When filled, this sentence continues through the existing natural-language drafting path.</span></label>
      <div className="mt-5 rounded-2xl border border-line bg-white p-4 text-[13px] leading-6">AirPods Pro · Wavelength — buy <b>{qty}</b> if each unit is below <b className="text-strike">{usd(Math.round(trigger * 100))}</b>, spending no more than <b>{usd(Math.round(cap * 100))}</b>.</div>
      <button onClick={() => void makeDraft()} disabled={phase === "drafting"} aria-busy={phase === "drafting"} className="mt-5 min-h-12 w-full rounded-full bg-ink px-5 text-[15px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-45">{phase === "drafting" ? "Drafting the rule…" : "Review signed scope"}</button>
      {phase === "error" && <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/5 p-4" role="alert"><p className="text-[13px] leading-5 text-danger">{err}</p>{needsPasskey && <Link href={guided ? "/setup?guided=1" : "/setup"} className="mt-3 inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-bg">Set up your passkey →</Link>}</div>}
    </section>}

    {(["review", "signing"] as Phase[]).includes(phase) && draft && <section className="mt-8" aria-live="polite"><ScopeCard zone={draft.signed_zone} hash={draft.mandate_hash} /><p className="mt-4 text-[13px] leading-6 text-muted">This signs the rule. It does not purchase anything yet.</p>{err && <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger" role="alert">{err}</p>}<button onClick={() => void sign()} disabled={phase === "signing"} aria-busy={phase === "signing"} className="mt-4 min-h-12 w-full rounded-full bg-ink px-5 text-[15px] font-semibold text-bg disabled:opacity-45">{phase === "signing" ? "Waiting for passkey…" : "Sign with passkey"}</button></section>}

    {(["signed", "arming"] as Phase[]).includes(phase) && draft && <section className="mt-8" aria-live="polite"><div className="boundary-rail border-l-strike p-6"><p className="num text-[11px] uppercase tracking-[0.18em] text-strike">Rule signed</p><h2 className="mt-3 text-[24px] font-semibold tracking-[-0.03em]">Rule signed. Now approve the one-time mandate with Prava.</h2><p className="mt-2 text-[14px] leading-6 text-muted">The passkey signature and Prava approval remain two separate actions.</p></div>{err && <p className="mt-3 rounded-xl border border-danger/30 bg-danger/5 p-3 text-[12px] text-danger" role="alert">{err}</p>}{phase === "signed" ? <button onClick={() => void arm()} className="mt-4 min-h-12 w-full rounded-full bg-ink px-5 text-[15px] font-semibold text-bg">Arm with Prava →</button> : <div className="mt-4 rounded-2xl border border-line bg-surface p-5"><p className="text-[14px] leading-6">{armMsg}</p><p className="mt-2 text-[12px] leading-5 text-muted">Strike keeps the approval URL only in this page. It never restarts the arm request while checking.</p>{popupBlocked && approvalUrl && <a href={approvalUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 text-[13px] font-semibold">Open Prava approval</a>}{pollingTimedOut && <button onClick={() => void checkApprovalStatus()} disabled={checking} aria-busy={checking} className="mt-3 min-h-11 w-full rounded-full border border-ink bg-white px-4 text-[13px] font-semibold disabled:opacity-45">{checking ? "Checking…" : "Check approval status"}</button>}</div>}</section>}

    {phase === "armed" && draft && <section className="boundary-rail mt-8 border-l-strike p-6 text-center" aria-live="polite"><p className="num text-[11px] uppercase tracking-[0.18em] text-strike">Armed · watching</p><h2 className="mt-3 text-[26px] font-semibold tracking-[-0.035em]">Your mandate is armed. Strike is watching Wavelength.</h2><p className="mx-auto mt-2 max-w-xl text-[14px] leading-6 text-muted">No payment has happened. Strike will act only if the signed rule becomes true.</p><Link href={guided ? `/demo?guided=1&mandate=${draft.mandate.id}` : `/m/${draft.mandate.id}`} className="mt-5 inline-flex min-h-12 items-center rounded-full bg-ink px-6 text-[14px] font-semibold text-bg">{guided ? "Open the live market test" : "View live mandate →"}</Link></section>}
  </main>;
}

function NumField({ label, prefix, value, onChange, min = 0, max = 100_000, disabled = false }: { label: string; prefix?: string; value: number; onChange: (value: number) => void; min?: number; max?: number; disabled?: boolean }) {
  return <label className="block"><span className="text-[13px] font-semibold">{label}</span><div className="mt-2 flex min-h-11 items-center rounded-xl border border-line bg-white px-3 focus-within:border-accent">{prefix && <span className="mr-1 text-muted">{prefix}</span>}<input type="number" value={value} min={min} max={max} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} className="num w-full bg-transparent text-[15px] outline-none disabled:text-muted" /></div></label>;
}

function ScopeCard({ zone, hash }: { zone: SignedZone; hash: string }) {
  return <div className="boundary-rail p-5 sm:p-7"><div className="flex items-center gap-3"><img src={zone.item.image_url} width={52} height={52} alt={zone.item.display_name} className="rounded-xl border border-line bg-white object-cover" /><div><h2 className="text-[17px] font-semibold">Review my rule</h2><p className="mt-1 text-[12px] text-muted">These are the exact limits your passkey will sign.</p></div></div><dl className="mt-6 grid gap-4 border-t border-line pt-5 sm:grid-cols-2"><Field label="Buy" value={zone.item.display_name} /><Field label="From" value={zone.merchant.name} /><Field label="When the price is below" value={usd(zone.condition.price_cents)} accent /><Field label="Never spend more than" value={usd(zone.max_total_cents)} /><Field label="Quantity" value={String(zone.quantity)} /><Field label="Valid until" value={new Date(zone.valid_until).toLocaleString()} /></dl><details className="mt-5 border-t border-line pt-4"><summary className="cursor-pointer text-[12px] font-semibold text-link">Technical details</summary><dl className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2"><Field label="Condition" value={zone.condition.type} /><Field label="Currency" value={zone.currency} /><Field label="Mode" value={zone.mode.replace("_", "-")} /><Field label="Merchant country" value={zone.merchant.country} /></dl><p className="num mt-4 break-all text-[10px] leading-5 text-muted">SHA-256 (JCS) · {hash}</p></details></div>;
}

function Field({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt><dd className={`num mt-1 text-[15px] ${accent ? "text-strike" : "text-ink"}`}>{value}</dd></div>;
}
