// PriceSource adapter (Doc 3 §3). The watcher reads the SAME public product API any merchant
// adapter would — over HTTP, honoring the trust boundary (Doc 4): Strike never queries store.db.
export interface PriceObservation {
  price_cents: number;
  in_stock: boolean;
  source: string;
  observed_at: string;
}

export interface PriceSource {
  observe(sku: string): Promise<PriceObservation | null>;
}

const APP_ORIGIN = process.env.APP_ORIGIN ?? "http://localhost:3000";

export const wavelengthAdapter: PriceSource = {
  async observe(sku) {
    try {
      const res = await fetch(`${APP_ORIGIN}/store/api/products/${sku}`, { cache: "no-store" });
      if (!res.ok) return null;
      const p = await res.json();
      if (typeof p.price_cents !== "number") return null;
      return { price_cents: p.price_cents, in_stock: Boolean(p.in_stock), source: "wavelength:http", observed_at: new Date().toISOString() };
    } catch {
      return null; // a failed poll is a no-op; next tick retries (Doc 3 §6)
    }
  },
};
