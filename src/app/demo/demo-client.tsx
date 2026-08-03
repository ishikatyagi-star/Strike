"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { oppositeScenario, previewPrice, selectMandateId } from "@/app/_components/guided-demo";
import { DemoProgress, TruthLabel } from "@/app/_components/guided-demo-ui";

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
type MandateRow = { mandate: { id: string; status: string; item: { display_name: string; image_url: string }; merchant: { name: string }; condition: { price_cents: number }; max_total_cents: number; quantity: number; created_at: string }; latest_price: { price_cents: number; in_stock: boolean } | null };
type Product = { sku: string; name: string; image_url: string; price_cents: number; sticker_cents: number; category: string; in_stock: boolean; verified_checkout: boolean };

export function DemoClient({ guided, requestedMandateId }: { guided: boolean; requestedMandateId: string | null }) {
  const router = useRouter();
  const [mandates, setMandates] = useState<MandateRow[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState(requestedMandateId ?? "");
  const [customDollars, setCustomDollars] = useState(174);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("Unlocking merchant controls…");
  const [merchantReady, setMerchantReady] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const [mandatesLoaded, setMandatesLoaded] = useState(false);
  const [mandateLoadFailed, setMandateLoadFailed] = useState(false);

  useEffect(() => {
    void fetch("/store/admin/unlock", { method: "POST" }).then((response) => {
      if (!response.ok) throw new Error();
      setMerchantReady(true);
      setMessage("Merchant controls are ready.");
    }).catch(() => setMessage("Merchant controls are unavailable. You can retry below."));
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      const [nextMandates, nextProducts] = await Promise.all([
        fetch("/api/mandates", { cache: "no-store" }).then(async (response) => response.ok ? await response.json() as MandateRow[] : null).catch(() => null),
        fetch("/store/api/catalog", { cache: "no-store" }).then(async (response) => response.ok ? await response.json() as Product[] : null).catch(() => null),
      ]);
      if (!active) return;
      setMandateLoadFailed(nextMandates == null);
      if (nextMandates != null) {
        setMandatesLoaded(true);
        setMandates(nextMandates);
        setSelected((current) => requestedMandateId
          ? nextMandates.some((row) => row.mandate.id === requestedMandateId) ? requestedMandateId : ""
          : current && nextMandates.some((row) => row.mandate.id === current) ? current : selectMandateId(nextMandates) ?? "");
      }
      if (nextProducts != null) setProducts(nextProducts);
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2_000);
    return () => { active = false; clearInterval(timer); };
  }, [requestedMandateId]);

  const mandate = mandates.find((row) => row.mandate.id === selected);
  const airpods = products.find((product) => product.sku === "airpods-pro");
  const exploreId = useMemo(() => selectMandateId(mandates), [mandates]);
  const proposedCents = Math.max(100, Math.round(customDollars * 100));
  const preview = mandate ? previewPrice(proposedCents, mandate.mandate.condition.price_cents, mandate.mandate.max_total_cents, mandate.mandate.quantity) : null;
  const controlsDisabled = !!busy || !mandate || mandate.mandate.status !== "armed";

  async function resetWavelength(navigate: boolean) {
    setBusy("reset"); setResetFailed(false); setMessage("Restoring Wavelength…");
    try {
      if (!merchantReady) {
        const unlock = await fetch("/store/admin/unlock", { method: "POST" });
        if (!unlock.ok) throw new Error();
        setMerchantReady(true);
      }
      const response = await fetch("/store/admin/reset", { method: "POST" });
      if (!response.ok) throw new Error();
      setMessage("Wavelength is restored to its starting catalogue.");
      if (navigate) router.push("/setup?guided=1");
    } catch {
      setResetFailed(true);
      setMessage("Wavelength could not be restored. Retry, or continue with the current live price.");
    } finally { setBusy(""); }
  }

  async function applyPrice() {
    if (!airpods || controlsDisabled) return;
    setBusy("price"); setMessage("Applying the merchant price…");
    try {
      const response = await fetch("/store/admin/price", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: airpods.sku, price_cents: proposedCents, in_stock: true }),
      });
      const json = await response.json().catch(() => ({}));
      setMessage(response.ok
        ? `AirPods Pro is now ${usd(proposedCents)}. Strike will evaluate the signed rule on its normal watcher cycle.`
        : `${json.error?.code ?? "UNAVAILABLE"}: Wavelength could not update the price.`);
    } catch {
      setMessage("UNAVAILABLE: Wavelength could not update the price.");
    } finally {
      setBusy("");
    }
  }

  if (!requestedMandateId) {
    return <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-5 py-8 sm:px-8 sm:py-12 lg:px-10 lg:py-16">
      <header className="flex items-center justify-between border-b border-line pb-6">
        <Link href="/" className="text-[24px] font-semibold tracking-[-0.04em] text-ink">Strike<span className="text-coral">.</span></Link>
        <TruthLabel tone="blue">About five minutes</TruthLabel>
      </header>
      <section className="grid flex-1 items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] lg:py-20">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.2em] text-muted">Self-guided demo</p>
          <h1 className="mt-5 max-w-4xl text-[clamp(2.8rem,7vw,6.5rem)] font-semibold leading-[0.98] tracking-[-0.06em] text-ink">Set the rule once. Strike buys only when it becomes true.</h1>
          <p className="mt-7 max-w-2xl text-[18px] leading-8 text-muted">AirPods Pro are $199. You approve up to $180. Strike waits.</p>
          <div className="mt-8 flex flex-wrap gap-2" aria-label="Demo systems">
            <TruthLabel tone="green">Wavelength · demo merchant</TruthLabel><TruthLabel tone="blue">Prava · sandbox</TruthLabel><TruthLabel>Visa · sandbox transaction</TruthLabel>
          </div>
        </div>
        <div className="boundary-rail p-6 sm:p-8">
          <h2 className="text-[20px] font-semibold tracking-[-0.025em]">Choose how to begin</h2>
          <p className="mt-2 text-[13px] leading-6 text-muted">The live path creates and signs a fresh rule. Exploration opens the newest useful mandate without changing it.</p>
          <button onClick={() => void resetWavelength(true)} disabled={!!busy} aria-busy={busy === "reset"} className="mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-full bg-ink px-5 text-[14px] font-semibold text-bg disabled:cursor-not-allowed disabled:opacity-45">{busy === "reset" ? "Preparing the demo…" : "Run the live demo"}</button>
          {mandatesLoaded && exploreId
            ? <Link href={`/demo?mandate=${encodeURIComponent(exploreId)}`} className="mt-3 inline-flex min-h-12 w-full items-center justify-center rounded-full border border-line bg-surface px-5 text-[14px] font-semibold text-ink hover:border-ink">Explore an existing mandate</Link>
            : <button disabled className="mt-3 min-h-12 w-full rounded-full border border-line bg-surface px-5 text-[14px] font-semibold text-muted opacity-60">{mandatesLoaded ? "Explore an existing mandate" : "Checking existing mandates…"}</button>}
          {mandateLoadFailed && <p className="mt-2 text-[12px] leading-5 text-muted">Existing mandates are temporarily unavailable.</p>}
          {mandatesLoaded && !mandateLoadFailed && !exploreId && <p className="mt-2 text-[12px] leading-5 text-muted">There is no active or completed mandate to explore yet.</p>}
          {resetFailed ? <div className="mt-4 rounded-2xl border border-danger/30 bg-danger/5 p-4" role="alert">
            <p className="text-[12px] leading-5 text-danger">{message}</p>
            <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void resetWavelength(true)} className="min-h-11 rounded-full bg-ink px-4 text-[12px] font-semibold text-bg">Retry reset</button><button onClick={() => router.push("/setup?guided=1")} className="min-h-11 rounded-full border border-line bg-white px-4 text-[12px] font-semibold text-ink">Continue with current live price</button></div>
          </div> : <p className="mt-4 min-h-5 text-[12px] leading-5 text-muted" role="status" aria-live="polite">{message}</p>}
        </div>
      </section>
    </main>;
  }

  return <main className="min-h-[100dvh] bg-bg px-4 py-6 text-ink sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1440px]">
      {guided && <DemoProgress current={4} />}
      <header className="flex flex-col gap-5 border-b border-line pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="num text-[11px] uppercase tracking-[0.2em] text-muted">{guided ? "Step 4 · Live market test" : "Operator cockpit"}</p><h1 className="mt-2 text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.045em]">Move the market. Watch the signed boundary hold.</h1></div>
        <div className="flex flex-wrap gap-2"><Link href="/" className="inline-flex min-h-11 items-center rounded-full border border-line bg-surface px-4 text-[13px] font-semibold">Mandate book</Link><Link href="/new" className="inline-flex min-h-11 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-bg">New mandate</Link></div>
      </header>
      <p className="mt-5 rounded-2xl border border-line bg-surface px-4 py-3 text-center text-[13px] font-semibold leading-6">Wavelength changes the market → Strike checks the signed rule → Prava enforces payment limits</p>
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,.85fr)]">
        <section className="boundary-rail order-1 self-start overflow-hidden bg-white" aria-label="Strike mandate timeline">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4 sm:px-6">
            <div><TruthLabel tone="blue">Strike · signed rule</TruthLabel><p className="mt-2 text-[13px] text-muted">Every row below comes from the append-only audit.</p></div>
            {!guided && mandates.length > 0 && <select aria-label="Choose a mandate" value={selected} onChange={(event) => setSelected(event.target.value)} className="min-h-11 rounded-full border border-line bg-white px-4 text-[13px]">{mandates.map((row) => <option key={row.mandate.id} value={row.mandate.id}>{row.mandate.item.display_name} · {row.mandate.status} · &lt; {usd(row.mandate.condition.price_cents)}</option>)}</select>}
          </div>
          {selected ? <iframe title="Live Strike mandate" src={`/m/${selected}`} className="h-[780px] w-full bg-white" /> : <div className="grid h-[500px] place-items-center px-6 text-center text-[14px] text-muted">That mandate is unavailable. Return to the demo entry and choose another.</div>}
        </section>
        <aside className="wavelength-panel order-2 rounded-[24px] border p-5 shadow-[var(--shadow-card)] sm:p-6" aria-label="Wavelength merchant simulator">
          <div className="border-b border-[var(--wv-line)] pb-4"><TruthLabel tone="green">Wavelength · live demo merchant</TruthLabel><p className="mt-3 text-[13px] text-[var(--wv-muted)]">Change the real catalogue price. Strike reacts on its existing watcher cycle.</p></div>
          {mandate && <div className="mt-4 rounded-2xl border border-[var(--wv-accent-line)] bg-[var(--wv-accent-soft)] p-4 text-[13px] leading-6"><b>{["fulfilled", "failed", "revoked", "expired"].includes(mandate.mandate.status) ? "Final market context" : "Watching"}:</b> {mandate.mandate.item.display_name}<br />Price must be below <span className="num">{usd(mandate.mandate.condition.price_cents)}</span>; total must stay at or below <span className="num">{usd(mandate.mandate.max_total_cents)}</span> for quantity {mandate.mandate.quantity}.</div>}
          {airpods && <section className="mt-4 rounded-2xl border border-[var(--wv-line)] bg-white p-4" aria-labelledby="price-control-title">
            <div className="flex items-center justify-between gap-3"><h2 id="price-control-title" className="text-[14px] font-semibold">AirPods Pro price</h2><span className="num rounded-full bg-[var(--wv-accent)] px-3 py-1 text-[17px]">{usd(proposedCents)}</span></div>
            <div className="mt-4 grid grid-cols-2 gap-2"><button onClick={() => setCustomDollars(199)} disabled={controlsDisabled} className="min-h-11 rounded-full border border-black bg-white px-3 text-[12px] font-semibold disabled:opacity-40">Keep price at $199</button><button onClick={() => setCustomDollars(174)} disabled={controlsDisabled} className="min-h-11 rounded-full bg-black px-3 text-[12px] font-semibold text-white disabled:opacity-40">Drop price to $174</button></div>
            <label className="mt-4 block text-[12px] font-semibold" htmlFor="custom-price">Custom price</label>
            <input id="custom-price" type="range" min={150} max={220} step={1} value={customDollars} onChange={(event) => setCustomDollars(Number(event.target.value))} disabled={controlsDisabled} className="mt-2 w-full accent-black disabled:opacity-40" />
            <div className="mt-2 flex items-center gap-2"><label className="flex min-h-11 items-center rounded-full border border-[var(--wv-line)] bg-white px-3"><span aria-hidden="true">$</span><span className="sr-only">Custom AirPods price in dollars</span><input type="number" min={1} value={customDollars} onChange={(event) => setCustomDollars(Number(event.target.value))} disabled={controlsDisabled} className="num w-20 bg-transparent px-1 outline-none" /></label><button onClick={() => void applyPrice()} disabled={controlsDisabled} className="min-h-11 flex-1 rounded-full bg-black px-4 text-[13px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">Apply price</button></div>
            {preview && <div className="mt-4 rounded-xl border border-[var(--wv-line)] bg-[var(--wv-bg)] p-3 text-[12px] leading-5"><b>Preview only · no event is created:</b>{" "}{preview.outcome === "watching" && `${usd(proposedCents)} is not below the strict ${usd(mandate!.mandate.condition.price_cents)} trigger, so Strike should keep watching.`}{preview.outcome === "eligible" && `${usd(preview.totalCents)} total is inside the signed ${usd(mandate!.mandate.max_total_cents)} cap, so the rule would be eligible to execute.`}{preview.outcome === "protected" && `${usd(preview.totalCents)} total exceeds the signed ${usd(mandate!.mandate.max_total_cents)} cap, so the signed boundary blocks the normal spend path.`}</div>}
            <button onClick={() => void resetWavelength(false)} disabled={controlsDisabled} className="mt-3 min-h-11 w-full rounded-full border border-black bg-white px-4 text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40">Restore Wavelength</button>
            {mandate && mandate.mandate.status !== "armed" && <p className="mt-3 text-[12px] leading-5 text-[var(--wv-muted)]">Price controls are paused while this mandate is {mandate.mandate.status}.</p>}
          </section>}
          <section className="mt-5" aria-labelledby="catalog-title"><div className="flex items-end justify-between gap-3"><h2 id="catalog-title" className="text-[20px] font-medium">Complete catalogue</h2><span className="text-[11px] text-[var(--wv-muted)]">Only AirPods uses verified checkout</span></div><div className="mt-3 grid grid-cols-2 gap-3 max-[359px]:grid-cols-1">{products.map((product) => <article key={product.sku} className="rounded-xl border border-[var(--wv-line)] bg-white p-3"><img src={product.image_url} alt={`${product.name} product`} className="aspect-[1.15] w-full rounded-lg bg-[var(--wv-bg)] object-contain p-2" /><h3 className="mt-2 text-[12px] font-semibold">{product.name}</h3><div className="num mt-1 text-[15px] font-semibold">{usd(product.price_cents)}</div><p className="mt-1 text-[10px] leading-4 text-[var(--wv-muted)]">{product.verified_checkout ? "Verified Prava checkout product" : "Catalogue item — not connected to the verified checkout demo."} · {product.in_stock ? "in stock" : "out of stock"}</p></article>)}</div></section>
          <p className="mt-4 min-h-5 text-[12px] leading-5 text-[var(--wv-muted)]" role="status" aria-live="polite">{message}</p>
          {guided && mandate && ["fulfilled", "failed"].includes(mandate.mandate.status) && <section className="mt-5 rounded-2xl border border-[var(--wv-accent-line)] bg-[var(--wv-accent-soft)] p-4"><h2 className="text-[14px] font-semibold">Continue the guided demo</h2><div className="mt-3 flex flex-wrap gap-2">{mandate.mandate.status === "fulfilled" && <Link href={`/m/${mandate.mandate.id}/receipt?guided=1`} className="inline-flex min-h-11 items-center rounded-full bg-black px-4 text-[12px] font-semibold text-white">View verified receipt</Link>}<Link href={`/new?guided=1&scenario=${oppositeScenario(mandate.mandate.status)}`} className="inline-flex min-h-11 items-center rounded-full border border-black bg-white px-4 text-[12px] font-semibold">Create a fresh {oppositeScenario(mandate.mandate.status) === "protection" ? "protection" : "successful-purchase"} mandate</Link></div></section>}
        </aside>
      </div>
    </div>
  </main>;
}
