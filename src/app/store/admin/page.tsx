// /store/admin — the lever + reset (Doc 5 S5). Gated by the demo-grade admin cookie (Doc 4 A3).
import { listProducts, SEED_PRODUCTS } from "@/lib/store/wavelength";
import { isAdmin } from "@/lib/store/http";
import { AdminControls } from "./controls";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const authed = await isAdmin();
  const products = listProducts();

  return (
    <div className="wv-wrap">
      <header className="wv-head">
        <div className="wv-brand">
          <span className="wv-logo" aria-hidden="true" />Wavelength<span className="wv-admin-tag">admin</span>
        </div>
      </header>

      {authed ? (
        <AdminControls products={products.map((product) => ({ ...product, sticker: SEED_PRODUCTS.find((seed) => seed.sku === product.sku)?.priceCents ?? product.priceCents }))} />
      ) : (
        <div className="wv-card wv-locked">
          <h2>Admin locked</h2>
          <p>
            Open <code>/store/admin/login?key=YOUR_STORE_ADMIN_KEY</code> once to unlock the demo controls
            (the key is <code>STORE_ADMIN_KEY</code> in <code>.env.local</code>).
          </p>
        </div>
      )}
    </div>
  );
}
