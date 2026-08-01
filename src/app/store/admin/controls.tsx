"use client";
// The demo lever (Doc 3 §7, Doc 5 S5). Presets only — typing $ amounts on stage is how demos die.
import { useState } from "react";
import { useRouter } from "next/navigation";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function AdminControls({
  products,
}: {
  products: { sku: string; name: string; priceCents: number; inStock: boolean; sticker: number }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function price(sku: string, cents: number, in_stock: boolean, label: string) {
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
      <div className="wv-admin-price">Merchant simulator · only AirPods has the verified Prava checkout path.</div>
      <div className="wv-admin-products">
        {products.map((product) => <div className="wv-admin-product" key={product.sku}>
          <div><b>{product.name}</b><span>{usd(product.priceCents)} · {product.inStock ? "in stock" : "out of stock"}</span></div>
          <div className="wv-admin-grid">
            {product.sku === "airpods-pro" && <button className="wv-btn drop" disabled={!!busy} onClick={() => price(product.sku, 17400, true, "drop")}>Drop to $174</button>}
            <button className="wv-btn" disabled={!!busy} onClick={() => price(product.sku, product.sticker, true, `restore-${product.sku}`)}>Restore {usd(product.sticker)}</button>
            <button className="wv-btn" disabled={!!busy} onClick={() => price(product.sku, Math.max(100, product.priceCents - 1000), true, `sale-${product.sku}`)}>Take $10 off</button>
            <button className="wv-btn" disabled={!!busy} onClick={() => price(product.sku, product.priceCents, !product.inStock, `stock-${product.sku}`)}>{product.inStock ? "Out of stock" : "Back in stock"}</button>
          </div>
        </div>)}
      </div>
      <button className="wv-btn reset" disabled={!!busy} onClick={reset}>Reset all products</button>
      <p className="wv-fine">Operator-only controls. The watcher notices AirPods changes on its next ~3s tick.</p>
    </div>
  );
}
