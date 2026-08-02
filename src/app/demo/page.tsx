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
  return <main className="min-h-[100dvh] bg-white px-4 py-6 font-sans text-[#0a0a0a] sm:px-6 lg:px-8">
    <header className="mx-auto flex max-w-[1440px] flex-col items-start gap-5 border-b border-[#eaecf0] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="num text-[11px] uppercase tracking-[.2em] text-[#5f5f5f]">Demo cockpit · one link, whole story</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-.04em]">The market moves. Strike holds the line.</h1><p className="mt-3 max-w-[980px] text-[14px] leading-relaxed text-[#45515e]">Agents can find deals — but can’t be trusted to <b className="text-[#0a0a0a]">wait and spend</b>. Strike is a purchase you pre-commit to with one passkey signature; Prava enforces the merchant, amount and single-use boundary.</p></div>
      <div className="flex flex-wrap gap-2"><Link href="/setup" className="inline-flex min-h-11 items-center rounded-full border border-[#0a0a0a] bg-white px-4 py-2 text-[13px] font-semibold text-[#0a0a0a] outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">Setup</Link><Link href="/new" className="inline-flex min-h-11 items-center rounded-full border border-[#0a0a0a] bg-[#0a0a0a] px-4 py-2 text-[13px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">Arm a mandate (operator)</Link></div>
    </header>

    {guide && <div className="mx-auto mt-6 max-w-[1440px] rounded-[24px] border border-[#e5e7eb] bg-[#f7f8fa] p-5">
      <div className="flex items-center justify-between">
        <div className="num inline-flex rounded-full bg-[#ff5530] px-3 py-1 text-[11px] uppercase tracking-[.16em] text-white">How to run this demo</div>
        <button onClick={() => setGuide(false)} className="min-h-11 rounded-full px-3 py-1.5 text-[12px] text-[#5f5f5f] outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8]">Hide ✕</button>
      </div>
      <ol className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STEPS.map((s, i) => <li key={i} onMouseEnter={() => setStep(i)} aria-current={step === i ? "step" : undefined} className={`rounded-2xl border p-4 transition ${step === i ? "border-[#ff5530] bg-white shadow-[0_0_22px_rgba(0,0,0,.06)]" : "border-[#e5e7eb] bg-white"}`}>
          <div className="flex items-center gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold ${step === i ? "bg-[#0a0a0a] text-white" : "bg-[#f2f3f5] text-[#0a0a0a]"}`}>{i + 1}</span><span className="text-[13px] font-semibold">{s.t}</span></div>
          <p className="mt-2 text-[12px] leading-relaxed text-[#5f5f5f]">{s.d}</p>
        </li>)}
      </ol>
    </div>}
    {!guide && <div className="mx-auto mt-5 max-w-[1440px]"><button onClick={() => setGuide(true)} className="min-h-11 rounded-full border border-[#0a0a0a] bg-[#0a0a0a] px-4 py-2 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">Show walkthrough</button></div>}

    <div className="mx-auto mt-6 grid max-w-[1440px] gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
      <section className="overflow-hidden rounded-[24px] border border-[#e5e7eb] bg-white" aria-label="Strike customer view">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eaecf0] bg-[#f7f8fa] px-5 py-4 sm:px-6"><div><div className="num inline-flex rounded-full bg-[#ff5530] px-3 py-1 text-[11px] uppercase tracking-[.16em] text-white">① Strike · customer view</div><div className="mt-2 text-[14px] text-[#5f5f5f]">Passkey-signed scope, live price, append-only audit.</div></div>
          {mandates.length > 0 && <select aria-label="Choose a mandate" value={selected} onChange={(event) => setSelected(event.target.value)} className="min-h-11 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-[13px] text-[#0a0a0a] outline-none focus:border-[#1d4ed8] focus:ring-2 focus:ring-[#bfdbfe]"><option value="">Choose a mandate</option>{mandates.map((row) => <option key={row.mandate.id} value={row.mandate.id}>{row.mandate.item.display_name} · {row.mandate.status} · &lt; {usd(row.mandate.condition.price_cents)}</option>)}</select>}</div>
        {selected ? <iframe title="Live Strike mandate" src={`/m/${selected}`} className="h-[720px] w-full bg-white" /> : <div className="flex h-[720px] items-center justify-center px-6 text-center text-[14px] text-[#5f5f5f]">No armed mandate yet. The operator arms one via “Arm a mandate” above; then judges just drop the price here.</div>}
      </section>
      <aside className="rounded-[20px] border border-[#e4e4e7] bg-[#fbfbf5] p-5 [font-family:var(--font-wavelength)] text-black shadow-[0_8px_8px_rgba(0,0,0,.06),0_2px_2px_rgba(0,0,0,.04)]" aria-label="Wavelength merchant simulator">
        <div className="flex items-center justify-between border-b border-[#d4d4d8] pb-4"><div><div className="inline-flex rounded-full bg-[#c1fbd4] px-3 py-1 text-[11px] font-semibold uppercase tracking-[.12em] text-black">② Wavelength · merchant simulator</div><p className="mt-2 text-[13px] text-[#52525b]">You are the store here. Change the price — Strike reacts.</p></div></div>
        {mandate && <div className="mt-4 rounded-xl border border-[#99b3ad] bg-[#d4f9e0] p-3 text-[13px]"><b>Watching:</b> {mandate.mandate.item.display_name} · live {mandate.latest_price ? usd(mandate.latest_price.price_cents) : "—"} · strike below {usd(mandate.mandate.condition.price_cents)}</div>}

        {airpods && <div className="mt-4 rounded-xl border border-[#e4e4e7] bg-white p-4">
          <div className="flex items-center justify-between"><span className="text-[13px] font-semibold">Set AirPods Pro price</span><span className="num rounded-full bg-[#c1fbd4] px-2.5 py-1 text-[17px] text-black">{usd(custom * 100)}</span></div>
          <input aria-label="Set AirPods Pro price" type="range" min={150} max={220} step={1} value={custom} onChange={(e) => setCustom(Number(e.target.value))} className="mt-4 w-full accent-black" />
          <div className="mt-2 flex items-center gap-2">
            <div className="flex min-h-11 items-center rounded-full border border-[#d4d4d8] bg-white px-3"><span className="text-[#71717a]">$</span><input aria-label="AirPods Pro price in dollars" type="number" min={1} value={custom} onChange={(e) => setCustom(Number(e.target.value))} className="num w-16 bg-transparent px-1 text-[14px] outline-none" /></div>
            <button disabled={!!busy} onClick={() => setPrice(airpods, Math.round(custom * 100), `price set to ${usd(custom * 100)}`)} className="min-h-11 flex-1 rounded-full bg-black px-4 py-2 text-[13px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#99b3ad] focus-visible:ring-offset-2 disabled:opacity-50">Set price → fire watcher</button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-[#71717a]">Tip: below the signed cap → it buys. Above the cap → the network declines.</p>
        </div>}

        <div className="mt-4 space-y-3">{products.map((product) => <article key={product.sku} className={`rounded-xl border p-3 ${product.verified_checkout ? "border-[#99b3ad] bg-white" : "border-[#e4e4e7] bg-white opacity-55"}`}><div className="flex gap-3"><img src={product.image_url} alt={product.name} className="h-14 w-14 rounded-lg bg-[#f2f2eb] p-1"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-semibold">{product.name}{product.verified_checkout && <span className="ml-2 rounded-full bg-[#c1fbd4] px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-black">Under mandate</span>}</h2><p className="mt-0.5 text-[11px] text-[#71717a]">{product.category}</p></div><div className="text-right"><div className={`num text-[17px] ${product.price_cents < product.sticker_cents ? "rounded-full bg-[#c1fbd4] px-2 text-black" : ""}`}>{usd(product.price_cents)}</div><div className="text-[10px] text-[#71717a]">{product.in_stock ? "in stock" : "out of stock"}</div></div></div>
            {product.verified_checkout ? <>
              <div className="mt-3 flex flex-wrap gap-2"><button disabled={!!busy} onClick={() => setPrice(product, 17400, "price dropped to $174")} className="min-h-11 rounded-full bg-black px-3 py-1.5 text-[12px] font-semibold text-white outline-none focus-visible:ring-2 focus-visible:ring-[#99b3ad] disabled:opacity-50">Drop to $174</button><button disabled={!!busy} onClick={() => setPrice(product, product.sticker_cents, `restored to ${usd(product.sticker_cents)}`)} className="min-h-11 rounded-full border border-black bg-white px-3 py-1.5 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#99b3ad] disabled:opacity-50">Restore</button><button disabled={!!busy} onClick={() => setPrice(product, Math.max(100, product.price_cents - 1000), "$10 sale applied")} className="min-h-11 rounded-full border border-[#99b3ad] bg-[#d4f9e0] px-3 py-1.5 text-[12px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[#99b3ad] disabled:opacity-50">− $10</button></div>
              <p className="mt-2 text-[11px] text-[#087443]">✓ Verified Prava checkout path — this is the product to test.</p>
            </> : <p className="mt-2 text-[11px] text-[#71717a]">Catalog context only — not part of this demo (no checkout, not testable).</p>}</div></div></article>)}</div>
        <p className="mt-4 min-h-5 text-[12px] text-[#52525b]" role="status" aria-live="polite">{message}</p>
      </aside>
    </div>
  </main>;
}
