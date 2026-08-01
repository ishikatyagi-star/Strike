"use client";
// S2 · Mandate book (Doc 5). A small, polled order book: its job is to make “armed and watching”
// immediately legible before the user opens the full audit timeline.
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
type Row = {
  mandate: { id: string; status: string; item: { display_name: string; image_url: string }; merchant: { name: string }; condition: { price_cents: number }; max_total_cents: number; valid_until: string };
  latest_price: { price_cents: number; in_stock: boolean; observed_at: string } | null;
};

function statusTone(status: string) {
  if (["armed", "triggered", "executing", "fulfilled"].includes(status)) return "text-strike";
  if (["failed", "revoked"].includes(status)) return "text-danger";
  if (status === "expired") return "text-warn";
  return "text-muted";
}

export default function MandateBook() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const load = () => fetch("/api/mandates", { cache: "no-store" }).then(async (r) => {
      const json = await r.json(); if (!r.ok) throw new Error(json.error?.message ?? "could not load mandates");
      if (active) { setRows(json); setError(""); }
    }).catch((e) => active && setError((e as Error).message));
    load(); const timer = setInterval(load, 2_000);
    return () => { active = false; clearInterval(timer); };
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-14">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Strike<span className="text-strike">.</span></h1>
        <div className="flex gap-4"><Link href="/setup" className="text-[13px] text-link">Setup</Link><Link href="/new" className="text-[13px] text-link">New mandate →</Link></div>
      </header>
      <p className="mt-2 text-[14px] text-muted">Conditional purchase mandates, live against the market.</p>
      {error && <p className="mt-6 rounded border border-danger/30 bg-danger/5 px-3 py-2 text-[13px] text-danger">Showing the last good state · {error}</p>}
      {rows === null ? <p className="mt-10 text-[14px] text-muted">Loading mandates…</p> : rows.length === 0 ? (
        <div className="mt-10 rounded-card border border-line bg-surface px-6 py-16 text-center"><p className="text-[15px] text-muted">No standing mandates.</p><Link href="/new" className="mt-5 inline-block text-[13px] text-link">Create your first mandate →</Link></div>
      ) : (
        <div className="mt-7 overflow-hidden rounded-card border border-line bg-surface">
          {rows.map(({ mandate: m, latest_price: p }) => {
            const below = p != null && p.price_cents < m.condition.price_cents;
            return <Link key={m.id} href={`/m/${m.id}`} className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0 hover:bg-white/[0.02]">
              <Image src={m.item.image_url} alt="" width={36} height={36} className="rounded bg-white/5" />
              <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="font-medium">{m.item.display_name}</span><span className={`num text-[10px] uppercase tracking-wider ${statusTone(m.status)}`}>{m.status === "triggered" ? "STRUCK" : m.status}</span></div><p className="mt-0.5 text-[12px] text-muted">{m.merchant.name} · trigger &lt; {usd(m.condition.price_cents)} · cap {usd(m.max_total_cents)}</p></div>
              <div className="text-right"><div className={`num text-[19px] ${below ? "text-strike" : "text-ink"}`}>{p ? usd(p.price_cents) : "—"}</div><div className="num text-[10px] uppercase tracking-wider text-muted">live price</div></div>
            </Link>;
          })}
        </div>
      )}
    </main>
  );
}
