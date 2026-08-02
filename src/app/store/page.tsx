// S5 · Wavelength storefront (Doc 5). The "right window" the whole demo watches: the price is
// huge, and an order-confirmed card appears the instant the strike lands (Beat 4's payoff).
import { getProduct, latestOrder, listProducts, SEED_PRODUCT } from "@/lib/store/wavelength";
import { Refresher } from "./refresher";

export const dynamic = "force-dynamic";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function StorePage() {
  const p = getProduct(SEED_PRODUCT.sku)!;
  const catalog = listProducts().filter((product) => product.sku !== p.sku);
  const order = latestOrder();
  const onSale = p.priceCents < SEED_PRODUCT.priceCents;

  return (
    <div className="wv-wrap">
      <Refresher />
      <header className="wv-head">
        <div className="wv-brand"><span className="wv-logo" aria-hidden="true" />Wavelength</div>
        <nav className="wv-nav" aria-label="Store navigation">Audio · Home · Support</nav>
      </header>

      <main className="wv-main">
        <div className="wv-media">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.imageUrl} alt={p.name} width={520} height={390} />
        </div>
        <div className="wv-info">
          <div className="wv-eyebrow">Wireless · Active Noise Cancellation</div>
          <h1 className="wv-title">{p.name}</h1>
          <div className="wv-priceRow">
            {onSale && <span className="wv-was">{usd(SEED_PRODUCT.priceCents)}</span>}
            <span className={`wv-price${onSale ? " sale" : ""}`}>{usd(p.priceCents)}</span>
          </div>
          <div className={`wv-stock ${p.inStock ? "in" : "out"}`}>
            {p.inStock ? "In stock · ships today" : "Out of stock"}
          </div>
          <button className="wv-buy" disabled={!p.inStock}>Add to cart</button>
          <p className="wv-fine">Free 30-day returns. Prices update in real time.</p>
        </div>
      </main>

      {order && order.status === "captured" && (
        <section className="wv-confirm" role="status" aria-live="polite">
          <div className="wv-check" aria-hidden="true">✓</div>
          <div>
            <div className="wv-confirm-title">Order confirmed</div>
            <div className="wv-confirm-sub">
              {p.name} · {usd(order.amountCents)} · card ····{order.cardLast4} · #{order.id.slice(0, 8)}
            </div>
          </div>
        </section>
      )}

      <section className="wv-catalog">
        <div className="wv-catalog-head"><h2>More from Wavelength</h2><span>Catalog preview</span></div>
        <div className="wv-catalog-grid">
          {catalog.map((product) => (
            <article className="wv-product-card" key={product.sku}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={product.imageUrl} alt={product.name} />
              <div className="wv-product-name">{product.name}</div>
              <div className="wv-product-price">{usd(product.priceCents)}</div>
              <div className="wv-product-note">Catalog item · checkout coming soon</div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
