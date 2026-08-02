"use client";
/* eslint-disable @next/next/no-img-element */
// Single-link demo cockpit. Everything a judge needs happens here: the guided walkthrough, the live
// mandate (iframe), and the mock-merchant price lever — no other URL to type. The lever self-unlocks
// on load (mock catalogue only; the spend gate/Prava/mandate stay passkey- and network-enforced).
import { useEffect, useState } from "react";
import Link from "next/link";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
type Mandate = { mandate: { id: string; status: string; item: { display_name: string }; condition: { price_cents: number }; max_total_cents: number }; latest_price: { price_cents: number } | null };
type Product = { sku: string; name: string; image_url: string; price_cents: number; sticker_cents: number; category: string; in_stock: boolean; verified_checkout: boolean };

const STEPS = [
  { t: "Watch the armed mandate", d: "On the left is a mandate the owner already passkey-signed and armed on Prava. No card is on file — Strike is just watching the price." },
  { t: "Drop the price below the cap", d: "Use the price lever on the right. Set AirPods Pro under the signed cap and the watcher fires within ~3s." },
  { t: "See it buy — headless", d: "The timeline runs TRIGGERED → Prava token minted → checkout → PAID. A real Prava/Visa sandbox charge, with nobody in the loop." },
  { t: "Try to break it", d: "Set a price the owner did NOT sign for (above the cap) on a fresh mandate — the card network itself declines. The signature is the only authority." },
];

export default function DemoCockpit() {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Unlocking merchant controls…");
  const [custom, setCustom] = useState(174);
  const [guide, setGuide] = useState(true);
  const [step, setStep] = useState(0);

  // Self-unlock the mock-merchant lever so the whole demo is one link (no /store/admin/login step).
  useEffect(() => { void fetch("/store/admin/unlock", { method: "POST" }).then(() => setMessage("Merchant controls are live. Drop the price to fire the mandate.")); }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [ms, ps] = await Promise.all([fetch("/api/mandates", { cache: "no-store" }), fetch("/store/api/catalog", { cache: "no-store" })]);
      if (!ms.ok || !ps.ok || !active) return;
      const nextMandates = await ms.json() as Mandate[];
      const nextProducts = await ps.json() as Product[];
      setMandates(nextMandates); setProducts(nextProducts);
      setSelected((current) => current || nextMandates.find((row) => row.mandate.status === "armed")?.mandate.id || nextMandates[0]?.mandate.id || "");
    };
    void refresh(); const timer = setInterval(() => void refresh(), 2_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  async function setPrice(product: Product, cents: number, label: string) {
    setBusy(product.sku); setMessage("");
    const res = await fetch("/store/admin/price", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sku: product.sku, price_cents: cents, in_stock: true }) });
    const json = await res.json().catch(() => ({}));
    setMessage(res.ok ? `${product.name}: ${label}. The catalogue and watcher refresh automatically.` : `${json.error?.code ?? "UNAUTHORIZED"}: could not reach the merchant lever.`);
    setBusy("");
  }

  const mandate = mandates.find((row) => row.mandate.id === selected);
  const airpods = products.find((p) => p.sku === "airpods-pro");
  return <main className="min-h-screen bg-bg px-6 py-8 text-ink">
    <header className="mx-auto flex max-w-[1500px] items-end justify-between gap-4">
      <div><p className="num text-[11px] uppercase tracking-[.2em] text-muted">Demo cockpit · one link, whole story</p><h1 className="mt-1 text-2xl font-semibold">The market moves. Strike holds the line.</h1><p className="mt-1 text-[14px] text-muted">Agents can find deals — but can’t be trusted to <b className="text-ink">wait and spend</b>. Strike is a purchase you pre-commit to with one passkey signature; Prava enforces the merchant, amount and single-use boundary.</p></div>
      <div className="flex gap-4"><Link href="/setup" className="text-[13px] text-link">Setup</Link><Link href="/new" className="text-[13px] text-link">Arm a mandate (operator)</Link></div>
    </header>

    {guide && <div className="mx-auto mt-5 max-w-[1500px] rounded-card border border-strike/30 bg-strike/5 p-4">
      <div className="flex items-center justify-between">
        <div className="num text-[11px] uppercase tracking-[.16em] text-strike">How to run this demo</div>
        <button onClick={() => setGuide(false)} className="text-[12px] text-muted hover:text-ink">Hide ✕</button>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => <li key={i} onMouseEnter={() => setStep(i)} className={`rounded-xl border p-3 transition ${step === i ? "border-strike/60 bg-strike/10" : "border-line bg-surface"}`}>
          <div className="flex items-center gap-2"><span className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${step === i ? "bg-strike text-bg" : "bg-line text-ink"}`}>{i + 1}</span><span className="text-[13px] font-semibold">{s.t}</span></div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">{s.d}</p>
        </li>)}
      </ol>
    </div>}
    {!guide && <div className="mx-auto mt-5 max-w-[1500px]"><button onClick={() => setGuide(true)} className="rounded-full border border-line bg-surface px-3 py-1.5 text-[12px] text-muted hover:border-strike hover:text-strike">Show walkthrough</button></div>}

    <div className="mx-auto mt-5 grid max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(430px,.85fr)]">
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><div className="num text-[11px] uppercase tracking-[.16em] text-strike">① Strike · customer view</div><div className="mt-1 text-[14px] text-muted">Passkey-signed scope, live price, append-only audit.</div></div>
          {mandates.length > 0 && <select value={selected} onChange={(event) => setSelected(event.target.value)} className="rounded border border-line bg-bg px-3 py-2 text-[13px] outline-none"><option value="">Choose a mandate</option>{mandates.map((row) => <option key={row.mandate.id} value={row.mandate.id}>{row.mandate.item.display_name} · {row.mandate.status} · &lt; {usd(row.mandate.condition.price_cents)}</option>)}</select>}</div>
        {selected ? <iframe title="Live Strike mandate" src={`/m/${selected}`} className="h-[720px] w-full bg-bg" /> : <div className="flex h-[720px] items-center justify-center px-6 text-center text-[14px] text-muted">No armed mandate yet. The operator arms one via “Arm a mandate” above; then judges just drop the price here.</div>}
      </section>
      <aside className="rounded-card border border-[#d9e2ee] bg-white p-5 text-[#101418] shadow-[0_16px_50px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b border-[#e8edf3] pb-4"><div><div className="text-[12px] font-semibold uppercase tracking-[.15em] text-[#0a57ff]">② Wavelength · merchant simulator</div><p className="mt-1 text-[13px] text-[#627080]">You are the store here. Change the price — Strike reacts.</p></div></div>
        {mandate && <div className="mt-4 rounded-xl border border-[#cfe2f3] bg-[#f4f8ff] p-3 text-[13px]"><b>Watching:</b> {mandate.mandate.item.display_name} · live {mandate.latest_price ? usd(mandate.latest_price.price_cents) : "—"} · strike below {usd(mandate.mandate.condition.price_cents)}</div>}

        {airpods && <div className="mt-4 rounded-xl border border-[#cfe2f3] bg-[#f7faff] p-3">
          <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">Set AirPods Pro price</span><span className="num text-[17px] text-[#0a57ff]">{usd(custom * 100)}</span></div>
          <input type="range" min={150} max={220} step={1} value={custom} onChange={(e) => setCustom(Number(e.target.value))} className="mt-3 w-full accent-[#0a57ff]" />
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-[#d7dee7] px-2 py-1"><span className="text-[#738090]">$</span><input type="number" min={1} value={custom} onChange={(e) => setCustom(Number(e.target.value))} className="num w-16 bg-transparent px-1 text-[14px] outline-none" /></div>
            <button disabled={!!busy} onClick={() => setPrice(airpods, Math.round(custom * 100), `price set to ${usd(custom * 100)}`)} className="flex-1 rounded-lg bg-[#0a57ff] px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Set price → fire watcher</button>
          </div>
          <p className="mt-2 text-[11px] text-[#738090]">Tip: below the signed cap → it buys. Above the cap → the network declines.</p>
        </div>}

        <div className="mt-4 space-y-3">{products.map((product) => <article key={product.sku} className={`rounded-xl border p-3 ${product.verified_checkout ? "border-[#0a57ff]/40 bg-[#f7faff]" : "border-[#e5eaf0] opacity-55"}`}><div className="flex gap-3"><img src={product.image_url} alt="" className="h-14 w-14 rounded-lg bg-[#f4f6f9] p-1"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-semibold">{product.name}{product.verified_checkout && <span className="ml-2 rounded bg-[#0a57ff] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">Under mandate</span>}</h2><p className="mt-0.5 text-[11px] text-[#738090]">{product.category}</p></div><div className="text-right"><div className={`num text-[17px] ${product.price_cents < product.sticker_cents ? "text-[#0a57ff]" : ""}`}>{usd(product.price_cents)}</div><div className="text-[10px] text-[#738090]">{product.in_stock ? "in stock" : "out of stock"}</div></div></div>
            {product.verified_checkout ? <>
              <div className="mt-3 flex flex-wrap gap-2"><button disabled={!!busy} onClick={() => setPrice(product, 17400, "price dropped to $174")} className="rounded-lg bg-[#e5484d] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">Drop to $174</button><button disabled={!!busy} onClick={() => setPrice(product, product.sticker_cents, `restored to ${usd(product.sticker_cents)}`)} className="rounded-lg border border-[#d7dee7] px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50">Restore</button><button disabled={!!busy} onClick={() => setPrice(product, Math.max(100, product.price_cents - 1000), "$10 sale applied")} className="rounded-lg border border-[#d7dee7] px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50">− $10</button></div>
              <p className="mt-2 text-[11px] text-[#0a57ff]">✓ Verified Prava checkout path — this is the product to test.</p>
            </> : <p className="mt-2 text-[11px] text-[#738090]">Catalog context only — not part of this demo (no checkout, not testable).</p>}</div></div></article>)}</div>
        <p className="mt-4 min-h-5 text-[12px] text-[#5a6672]">{message}</p>
      </aside>
    </div>
  </main>;
}
