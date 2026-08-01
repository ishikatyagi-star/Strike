"use client";
// The demo lever (Doc 3 §7, Doc 5 S5). Presets only — typing $ amounts on stage is how demos die.
import { useState } from "react";
import { useRouter } from "next/navigation";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function AdminControls({
  sku,
  priceCents,
  inStock,
  sticker,
}: {
  sku: string;
  priceCents: number;
  inStock: boolean;
  sticker: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function price(cents: number, in_stock: boolean, label: string) {
    setBusy(label);
    await fetch("/store/admin/price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, price_cents: cents, in_stock }),
    });
    router.refresh();
    setBusy(null);
  }

  async function reset() {
    setBusy("reset");
    await fetch("/store/admin/reset", { method: "POST" });
    router.refresh();
    setBusy(null);
  }

  return (
    <div className="wv-card">
      <div className="wv-admin-price">
        Current price <b>{usd(priceCents)}</b> · {inStock ? "in stock" : "out of stock"}
      </div>
      <div className="wv-admin-grid">
        <button className="wv-btn drop" disabled={!!busy} onClick={() => price(17400, true, "drop")}>
          Drop price to $174
        </button>
        <button className="wv-btn" disabled={!!busy} onClick={() => price(sticker, true, "restore")}>
          Restore to $199
        </button>
        <button className="wv-btn" disabled={!!busy} onClick={() => price(priceCents, !inStock, "stock")}>
          {inStock ? "Mark out of stock" : "Back in stock"}
        </button>
        <button className="wv-btn reset" disabled={!!busy} onClick={reset}>
          Reset demo
        </button>
      </div>
      <p className="wv-fine">Presets only. The watcher notices on its next ~3s tick.</p>
    </div>
  );
}
