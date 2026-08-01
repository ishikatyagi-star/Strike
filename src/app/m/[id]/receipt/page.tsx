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

  if (error) return <main className="mx-auto max-w-2xl px-6 py-16"><p className="text-danger">{error}</p></main>;
  if (!receipt) return <main className="mx-auto max-w-2xl px-6 py-16"><p className="text-muted">Loading receipt…</p></main>;
  const verified = receipt.verification.hash_verified && receipt.verification.signature_verified;
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <p className="num text-xs uppercase tracking-[0.2em] text-muted">S4 · Receipt</p>
      <h1 className="mt-2 text-2xl font-semibold">Verifiable receipt</h1>
      <section className={`mt-6 rounded-card border p-5 ${verified ? "border-strike/40 bg-strike/5" : "border-danger/40 bg-danger/5"}`}>
        <div className={`num text-[11px] uppercase tracking-[0.18em] ${verified ? "text-strike" : "text-danger"}`}>{verified ? "verified" : "verification failed"}</div>
        <p className="mt-2 text-[15px] font-medium">hash {receipt.verification.hash_verified ? "✓ matches signed fields" : "✕ mismatch"} · signature {receipt.verification.signature_verified ? "✓ verified against passkey" : "✕ invalid"}</p>
      </section>
      <dl className="mt-6 space-y-3 rounded-card border border-line bg-surface p-5 text-[13px]">
        <div><dt className="num text-[11px] uppercase tracking-wider text-muted">format</dt><dd>{receipt.format}</dd></div>
        <div><dt className="num text-[11px] uppercase tracking-wider text-muted">audit events</dt><dd>{receipt.events.length}</dd></div>
        <div><dt className="num text-[11px] uppercase tracking-wider text-muted">hash</dt><dd className="num break-all text-[11px] text-muted">{receipt.mandate_hash}</dd></div>
      </dl>
      <p className="mt-5 text-[13px] text-muted">{receipt.how_to_verify}</p>
      <button onClick={download} className="mt-6 rounded bg-ink px-4 py-2.5 text-[14px] font-semibold text-bg">Download verifiable receipt (JSON)</button>
    </main>
  );
}
