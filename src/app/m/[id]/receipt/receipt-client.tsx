"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DemoProgress, TruthLabel } from "@/app/_components/guided-demo-ui";

type Receipt = { format: string; mandate_hash: string; verification: { hash_verified: boolean; signature_verified: boolean }; events: unknown[]; generated_at: string; how_to_verify: string };

export function ReceiptClient({ id, guided }: { id: string; guided: boolean }) {
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/mandates/${id}/receipt`, { cache: "no-store" }).then(async (response) => {
      const json = await response.json();
      if (!response.ok || json.error) throw new Error(json.error?.message ?? "Could not load receipt.");
      setReceipt(json); setRaw(JSON.stringify(json, null, 2));
    }).catch((reason) => setError((reason as Error).message));
  }, [id]);

  function download() {
    if (!raw) return;
    const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `strike-receipt-${id}.json`; anchor.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <main className="mx-auto min-h-[100dvh] max-w-3xl px-5 py-12"><p className="rounded-2xl border border-danger/30 bg-danger/5 p-4 text-danger" role="alert">{error}</p></main>;
  if (!receipt) return <main className="mx-auto min-h-[100dvh] max-w-3xl px-5 py-12"><p className="text-muted" role="status">Loading receipt…</p></main>;

  const verified = receipt.verification.hash_verified && receipt.verification.signature_verified;
  return <main className="mx-auto min-h-[100dvh] w-full max-w-4xl px-5 py-8 sm:px-8 sm:py-12 lg:px-10 lg:py-16">
    {guided && <DemoProgress current={5} />}
    <p className="num text-[11px] uppercase tracking-[0.2em] text-muted">{guided ? "Step 5 · Verify" : "S4 · Receipt"}</p>
    <h1 className="mt-4 text-[clamp(2.5rem,6vw,4.5rem)] font-semibold leading-[1.03] tracking-[-0.055em]">The signed rule and result travel together.</h1>
    <section className={`boundary-rail mt-8 p-6 sm:p-8 ${verified ? "border-l-strike" : "border-l-danger"}`} aria-live="polite">
      <TruthLabel tone={verified ? "green" : "neutral"}>{verified ? "Verified receipt" : "Verification failed"}</TruthLabel>
      <h2 className="mt-4 text-[24px] font-semibold tracking-[-0.03em]">{verified ? "The stored rule still matches the passkey signature." : "The receipt did not pass every verification check."}</h2>
      <p className="mt-3 text-[14px] leading-6 text-muted">Hash {receipt.verification.hash_verified ? "matches the signed fields" : "does not match"}. Signature {receipt.verification.signature_verified ? "verifies against the registered passkey" : "is invalid"}.</p>
    </section>
    <dl className="mt-6 grid overflow-hidden rounded-2xl border border-line bg-line text-[13px] sm:grid-cols-2">
      <Meta label="Format" value={receipt.format} /><Meta label="Real audit events" value={String(receipt.events.length)} />
      <div className="bg-surface p-5 sm:col-span-2"><dt className="num text-[10px] uppercase tracking-wider text-muted">Mandate hash</dt><dd className="num mt-2 break-all text-[11px] leading-5 text-muted">{receipt.mandate_hash}</dd></div>
    </dl>
    <details className="mt-5 rounded-2xl border border-line bg-surface p-5"><summary className="cursor-pointer text-[13px] font-semibold text-link">How to verify this receipt</summary><p className="mt-3 text-[13px] leading-6 text-muted">{receipt.how_to_verify}</p></details>
    <div className="mt-6 flex flex-wrap gap-3"><button onClick={download} className="min-h-12 rounded-full bg-ink px-5 text-[14px] font-semibold text-bg">Download verifiable receipt (JSON)</button>{guided && <Link href="/new?guided=1&scenario=protection" className="inline-flex min-h-12 items-center rounded-full border border-line bg-white px-5 text-[14px] font-semibold">Try the protection scenario</Link>}</div>
  </main>;
}

function Meta({ label, value }: { label: string; value: string }) {
  return <div className="bg-surface p-5"><dt className="num text-[10px] uppercase tracking-wider text-muted">{label}</dt><dd className="mt-2 text-ink">{value}</dd></div>;
}
