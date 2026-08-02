"use client";
// S4 · portable verification artifact. The server re-verifies the stored passkey assertion; this
// screen makes that result and the complete JSON bundle available without exposing payment data.
import { use, useEffect, useState } from "react";

type Receipt = {
  format: string;
  mandate_hash: string;
  verification: { hash_verified: boolean; signature_verified: boolean };
  events: unknown[];
  generated_at: string;
  how_to_verify: string;
};

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/mandates/${id}/receipt`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error?.message ?? "could not load receipt");
        setReceipt(json); setRaw(JSON.stringify(json, null, 2));
      })
      .catch((e) => setError((e as Error).message));
  }, [id]);

  function download() {
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `strike-receipt-${id}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <main className="mx-auto min-h-[100dvh] max-w-3xl bg-white px-4 py-12 text-[#0a0a0a] sm:px-6 sm:py-16"><p className="rounded-xl border border-danger/30 bg-danger/5 p-4 text-danger" role="alert">{error}</p></main>;
  if (!receipt) return <main className="mx-auto min-h-[100dvh] max-w-3xl bg-white px-4 py-12 text-[#0a0a0a] sm:px-6 sm:py-16"><p className="text-[#6b7280]" role="status">Loading receipt…</p></main>;
  const verified = receipt.verification.hash_verified && receipt.verification.signature_verified;
  return (
    <main className="mx-auto min-h-[100dvh] w-full max-w-3xl bg-white px-4 py-10 text-[#0a0a0a] sm:px-6 sm:py-14 lg:py-16">
      <p className="num text-xs font-medium uppercase tracking-[0.2em] text-[#6b7280]">S4 · Receipt</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Verifiable receipt</h1>
      <section className={`mt-7 rounded-2xl border p-5 sm:p-6 ${verified ? "border-strike/30 bg-strike/5" : "border-danger/30 bg-danger/5"}`} aria-live="polite">
        <div className={`num inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] ring-1 ring-inset ${verified ? "bg-strike/10 text-strike ring-strike/30" : "bg-danger/10 text-danger ring-danger/30"}`}>{verified ? "verified" : "verification failed"}</div>
        <p className="mt-3 text-[15px] font-medium leading-6 text-[#30343b]">hash {receipt.verification.hash_verified ? "✓ matches signed fields" : "✕ mismatch"} · signature {receipt.verification.signature_verified ? "✓ verified against passkey" : "✕ invalid"}</p>
      </section>
      <dl className="mt-6 grid grid-cols-1 overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#e5e7eb] text-[13px] sm:grid-cols-2">
        <div className="bg-[#f7f8fa] p-5"><dt className="num text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">format</dt><dd className="mt-1 text-[#0a0a0a]">{receipt.format}</dd></div>
        <div className="bg-[#f7f8fa] p-5"><dt className="num text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">audit events</dt><dd className="mt-1 text-[#0a0a0a]">{receipt.events.length}</dd></div>
        <div className="bg-[#f7f8fa] p-5 sm:col-span-2"><dt className="num text-[11px] font-medium uppercase tracking-wider text-[#6b7280]">hash</dt><dd className="num mt-1 break-all text-[11px] leading-5 text-[#6b7280]">{receipt.mandate_hash}</dd></div>
      </dl>
      <p className="mt-5 rounded-xl border border-[#dbe4f1] bg-[#f5f8fc] p-4 text-[13px] leading-6 text-[#45515e]">{receipt.how_to_verify}</p>
      <button onClick={download} className="mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-[#0a0a0a] px-5 py-3 text-[14px] font-semibold text-white transition-[background-color,transform] hover:bg-[#242424] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1d4ed8] focus-visible:ring-offset-2">Download verifiable receipt (JSON)</button>
    </main>
  );
}
