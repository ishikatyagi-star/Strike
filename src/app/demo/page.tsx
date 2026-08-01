"use client";
/* eslint-disable @next/next/no-img-element */
// Operator-only stage view. This is intentionally a simulator: the merchant controls change the
// mock Wavelength catalogue, while the iframe shows the unmodified Strike audit experience.
import { useEffect, useState } from "react";
import Link from "next/link";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
type Mandate = { mandate: { id: string; status: string; item: { display_name: string }; condition: { price_cents: number }; max_total_cents: number }; latest_price: { price_cents: number } | null };
type Product = { sku: string; name: string; image_url: string; price_cents: number; sticker_cents: number; category: string; in_stock: boolean; verified_checkout: boolean };

export default function DemoCockpit() {
  const [mandates, setMandates] = useState<Mandate[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Merchant controls require the local Wavelength admin session.");

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
    setMessage(res.ok ? `${product.name}: ${label}. The catalogue and watcher refresh automatically.` : `${json.error?.code ?? "UNAUTHORIZED"}: unlock Wavelength admin first.`);
    setBusy("");
  }

  const mandate = mandates.find((row) => row.mandate.id === selected);
  return <main className="min-h-screen bg-bg px-6 py-8 text-ink">
    <header className="mx-auto flex max-w-[1500px] items-end justify-between gap-4">
      <div><p className="num text-[11px] uppercase tracking-[.2em] text-muted">Operator view · demo cockpit</p><h1 className="mt-1 text-2xl font-semibold">The market moves. Strike holds the line.</h1><p className="mt-1 text-[14px] text-muted">Left: customer-facing mandate. Right: clearly labelled Wavelength merchant simulator.</p></div>
      <div className="flex gap-4"><Link href="/" className="text-[13px] text-link">Mandate book</Link><Link href="/new" className="text-[13px] text-link">New mandate</Link></div>
    </header>
    <div className="mx-auto mt-6 grid max-w-[1500px] gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(430px,.85fr)]">
      <section className="overflow-hidden rounded-card border border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4"><div><div className="num text-[11px] uppercase tracking-[.16em] text-strike">Strike · customer view</div><div className="mt-1 text-[14px] text-muted">Passkey-signed scope, live price, append-only audit.</div></div>
          {mandates.length > 0 && <select value={selected} onChange={(event) => setSelected(event.target.value)} className="rounded border border-line bg-bg px-3 py-2 text-[13px] outline-none"><option value="">Choose a mandate</option>{mandates.map((row) => <option key={row.mandate.id} value={row.mandate.id}>{row.mandate.item.display_name} · {row.mandate.status} · &lt; {usd(row.mandate.condition.price_cents)}</option>)}</select>}</div>
        {selected ? <iframe title="Live Strike mandate" src={`/m/${selected}`} className="h-[720px] w-full bg-bg" /> : <div className="flex h-[720px] items-center justify-center text-[14px] text-muted">Create and arm a mandate to begin the live run.</div>}
      </section>
      <aside className="rounded-card border border-[#d9e2ee] bg-white p-5 text-[#101418] shadow-[0_16px_50px_rgba(0,0,0,.18)]">
        <div className="flex items-center justify-between border-b border-[#e8edf3] pb-4"><div><div className="text-[12px] font-semibold uppercase tracking-[.15em] text-[#0a57ff]">Wavelength · merchant simulator</div><p className="mt-1 text-[13px] text-[#627080]">Operator controls — never available to shoppers.</p></div><Link href="/store/admin" className="text-[13px] text-[#0a57ff]">Admin ↗</Link></div>
        {mandate && <div className="mt-4 rounded-xl border border-[#cfe2f3] bg-[#f4f8ff] p-3 text-[13px]"><b>Watching:</b> {mandate.mandate.item.display_name} · live {mandate.latest_price ? usd(mandate.latest_price.price_cents) : "—"} · strike below {usd(mandate.mandate.condition.price_cents)}</div>}
        <div className="mt-4 space-y-3">{products.map((product) => <article key={product.sku} className="rounded-xl border border-[#e5eaf0] p-3"><div className="flex gap-3"><img src={product.image_url} alt="" className="h-14 w-14 rounded-lg bg-[#f4f6f9] p-1"/><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h2 className="text-[14px] font-semibold">{product.name}</h2><p className="mt-0.5 text-[11px] text-[#738090]">{product.category}</p></div><div className="text-right"><div className={`num text-[17px] ${product.price_cents < product.sticker_cents ? "text-[#0a57ff]" : ""}`}>{usd(product.price_cents)}</div><div className="text-[10px] text-[#738090]">{product.in_stock ? "in stock" : "out of stock"}</div></div></div>
            <div className="mt-3 flex flex-wrap gap-2">{product.sku === "airpods-pro" && <button disabled={!!busy} onClick={() => setPrice(product, 17400, "price dropped to $174")} className="rounded-lg bg-[#e5484d] px-2.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">Drop to $174</button>}<button disabled={!!busy} onClick={() => setPrice(product, product.sticker_cents, `restored to ${usd(product.sticker_cents)}`)} className="rounded-lg border border-[#d7dee7] px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50">Restore</button><button disabled={!!busy} onClick={() => setPrice(product, Math.max(100, product.price_cents - 1000), "$10 sale applied")} className="rounded-lg border border-[#d7dee7] px-2.5 py-1.5 text-[12px] font-semibold disabled:opacity-50">− $10</button></div>
            <p className="mt-2 text-[11px] text-[#738090]">{product.verified_checkout ? "✓ Verified Prava checkout path" : "Catalog context only — no checkout claim"}</p></div></div></article>)}</div>
        <p className="mt-4 min-h-5 text-[12px] text-[#5a6672]">{message}</p>
      </aside>
    </div>
  </main>;
}
