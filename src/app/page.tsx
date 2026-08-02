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
  if (["armed", "triggered", "executing", "fulfilled"].includes(status)) return "border-strike/25 bg-strike/10 text-strike";
  if (["failed", "revoked"].includes(status)) return "border-danger/25 bg-danger/10 text-danger";
  if (status === "expired") return "border-warn/25 bg-warn/10 text-warn";
  return "border-line bg-bg text-muted";
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
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[28px] font-semibold tracking-[-0.04em]">Strike<span className="text-coral">.</span></h1>
        <nav aria-label="Primary" className="flex flex-wrap items-center gap-2">
          <Link href="/setup" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-5 text-[13px] font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">Setup</Link>
          <Link href="/demo" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-5 text-[13px] font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">Demo cockpit</Link>
          <Link href="/new" className="inline-flex min-h-10 items-center justify-center rounded-full bg-ink px-5 text-[13px] font-semibold text-bg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">New mandate →</Link>
        </nav>
      </header>
      <p className="max-w-3xl pb-10 pt-12 text-[clamp(2rem,5vw,3.5rem)] font-semibold leading-[1.08] tracking-[-0.045em] text-ink sm:pb-12 sm:pt-16">Conditional purchase mandates, live against the market.</p>
      {error && <p role="status" className="mb-5 rounded-2xl border border-danger/30 bg-danger/5 px-5 py-3 text-[13px] leading-5 text-danger">Showing the last good state · {error}</p>}
      {rows === null ? <p role="status" aria-live="polite" className="rounded-2xl border border-line bg-surface px-5 py-6 text-[14px] text-muted">Loading mandates…</p> : rows.length === 0 ? (
        <div className="rounded-3xl border border-line bg-surface px-6 py-16 text-center sm:px-10 sm:py-20"><p className="text-[16px] text-muted">No standing mandates.</p><Link href="/new" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 text-[13px] font-semibold text-bg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">Create your first mandate →</Link></div>
      ) : (
        <div className="overflow-hidden rounded-3xl border border-line bg-surface">
          {rows.map(({ mandate: m, latest_price: p }) => {
            const below = p != null && p.price_cents < m.condition.price_cents;
            return <Link key={m.id} href={`/m/${m.id}`} className="grid min-h-24 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 border-b border-line px-4 py-5 transition-colors last:border-0 hover:bg-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-link sm:gap-5 sm:px-6">
              <Image src={m.item.image_url} alt={m.item.display_name} width={48} height={48} className="h-12 w-12 rounded-2xl border border-line bg-bg object-cover" />
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="truncate text-[15px] font-semibold tracking-[-0.01em]">{m.item.display_name}</span><span className={`num rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wider ${statusTone(m.status)}`}>{m.status === "triggered" ? "STRUCK" : m.status}</span></div><p className="mt-1.5 text-[12px] leading-5 text-muted">{m.merchant.name} · trigger &lt; {usd(m.condition.price_cents)} · cap {usd(m.max_total_cents)}</p></div>
              <div className="text-right"><div className={`num text-[20px] font-semibold tracking-[-0.03em] sm:text-[24px] ${below ? "text-strike" : "text-ink"}`}>{p ? usd(p.price_cents) : "—"}</div><div className="num mt-1 text-[10px] uppercase tracking-wider text-muted">live price</div></div>
            </Link>;
          })}
        </div>
      )}
    </main>
  );
}
