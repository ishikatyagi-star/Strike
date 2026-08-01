import type { ReactNode } from "react";

// Wavelength's own visual world — white, warm, rounded, blue brand (Doc 5 §1/§2). Deliberately
// the opposite of Strike's dark instrument: the visual boundary IS the architecture boundary.
const css = `
.wv-root{min-height:100vh;background:#ffffff;color:#101418;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;}
.wv-wrap{max-width:980px;margin:0 auto;padding:28px 24px 72px;}
.wv-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:18px;border-bottom:1px solid #eef1f5;}
.wv-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:20px;letter-spacing:-.01em;}
.wv-logo{width:22px;height:22px;border-radius:7px;display:inline-block;
  background:conic-gradient(from 210deg,#0A57FF,#63a0ff,#0A57FF);}
.wv-nav{color:#6b7684;font-size:14px;}
.wv-admin-tag{font-size:11px;font-weight:700;color:#0A57FF;background:#eaf1ff;border-radius:6px;
  padding:2px 7px;letter-spacing:.05em;text-transform:uppercase;margin-left:4px;}
.wv-main{display:grid;grid-template-columns:1.1fr 1fr;gap:36px;align-items:center;margin-top:40px;}
.wv-media{background:#f4f6f9;border-radius:20px;padding:20px;display:flex;align-items:center;justify-content:center;}
.wv-media img{width:100%;height:auto;max-width:520px;display:block;}
.wv-eyebrow{color:#0A57FF;font-size:12.5px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;}
.wv-title{font-size:40px;margin:8px 0 16px;letter-spacing:-.02em;font-weight:700;line-height:1.05;}
.wv-priceRow{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;}
.wv-was{color:#9aa4b0;text-decoration:line-through;font-size:22px;font-variant-numeric:tabular-nums;}
.wv-price{font-size:44px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;}
.wv-price.sale{color:#0A57FF;}
.wv-stock{margin-top:12px;font-size:14px;font-weight:600;}
.wv-stock.in{color:#0a7d4d;} .wv-stock.out{color:#c2334a;}
.wv-buy{margin-top:22px;background:#0A57FF;color:#fff;border:none;border-radius:12px;padding:14px 22px;
  font-size:15px;font-weight:600;cursor:pointer;}
.wv-buy:disabled{background:#c8d2df;cursor:not-allowed;}
.wv-fine{color:#8a94a1;font-size:12.5px;margin-top:16px;}
.wv-confirm{margin-top:34px;display:flex;gap:14px;align-items:center;background:#f0f9f4;
  border:1px solid #cdead9;border-radius:14px;padding:18px 20px;}
.wv-check{width:34px;height:34px;border-radius:50%;background:#12b76a;color:#fff;display:flex;
  align-items:center;justify-content:center;font-weight:700;flex:none;}
.wv-confirm-title{font-weight:700;font-size:15px;}
.wv-confirm-sub{color:#5a6672;font-size:13.5px;margin-top:2px;font-variant-numeric:tabular-nums;}
.wv-catalog{margin-top:56px;padding-top:28px;border-top:1px solid #eef1f5;}
.wv-catalog-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:18px;}
.wv-catalog-head h2{margin:0;font-size:22px;letter-spacing:-.02em;}.wv-catalog-head span{color:#8a94a1;font-size:12px;}
.wv-catalog-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
.wv-product-card{border:1px solid #e8edf3;border-radius:14px;padding:12px;}.wv-product-card img{width:100%;aspect-ratio:1.18;object-fit:contain;background:#f4f6f9;border-radius:10px;}
.wv-product-name{font-size:13px;font-weight:650;margin-top:10px;}.wv-product-price{font-size:15px;font-weight:700;margin-top:3px;font-variant-numeric:tabular-nums;}.wv-product-note{font-size:10.5px;color:#8a94a1;margin-top:4px;}
.wv-card{background:#fff;border:1px solid #eef1f5;border-radius:16px;padding:24px;margin-top:28px;
  box-shadow:0 4px 24px rgba(16,20,24,.05);}
.wv-locked h2{margin:0 0 8px;font-size:18px;}
.wv-locked code{background:#f4f6f9;padding:2px 6px;border-radius:6px;font-size:13px;}
.wv-admin-price{font-size:15px;color:#5a6672;margin-bottom:16px;}
.wv-admin-price b{color:#101418;font-size:18px;font-variant-numeric:tabular-nums;}
.wv-admin-products{display:grid;gap:12px;}.wv-admin-product{border:1px solid #eef1f5;border-radius:12px;padding:14px;display:grid;grid-template-columns:minmax(140px,1fr) 1.5fr;gap:14px;align-items:center;}
.wv-admin-product b{display:block;font-size:14px;}.wv-admin-product span{display:block;color:#6b7684;font-size:12px;margin-top:3px;font-variant-numeric:tabular-nums;}
.wv-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
.wv-btn{border:1px solid #d7dee7;background:#fff;border-radius:12px;padding:14px 16px;font-size:14px;
  font-weight:600;cursor:pointer;color:#101418;transition:border-color .15s ease;}
.wv-btn:hover:not(:disabled){border-color:#0A57FF;}
.wv-btn:disabled{opacity:.5;cursor:default;}
.wv-btn.drop{background:#e5484d;border-color:#e5484d;color:#fff;font-size:15px;}
.wv-btn.reset{color:#6b7684;margin-top:16px;}
@media (max-width:760px){.wv-main{grid-template-columns:1fr;}.wv-admin-grid{grid-template-columns:1fr;}.wv-catalog-grid{grid-template-columns:1fr 1fr;}.wv-admin-product{grid-template-columns:1fr;}}
`;

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wv-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </div>
  );
}
