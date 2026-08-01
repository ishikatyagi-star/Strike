// Strike's merchant registry (Doc 2 §1: merchant.id is "our registry key"). These identity
// fields must match what Wavelength serves and what we pin into the Prava mandate (Doc 2 §7) —
// price is NOT here (it's watched live). Strike never imports the store module (trust boundary).
export const MERCHANTS = {
  wavelength: {
    id: "wavelength",
    name: "Wavelength",
    url: "https://wavelength.store",
    country: "US",
    items: {
      "airpods-pro": {
        sku: "airpods-pro",
        display_name: "AirPods Pro",
        image_url: "/products/airpods-pro.svg",
      },
    },
  },
} as const;

export type MerchantId = keyof typeof MERCHANTS;

export function resolveItem(merchantId: string, sku: string) {
  const m = MERCHANTS[merchantId as MerchantId];
  if (!m) return null;
  const item = m.items[sku as keyof typeof m.items];
  if (!item) return null;
  return { merchant: { id: m.id, name: m.name, url: m.url, country: m.country }, item };
}
