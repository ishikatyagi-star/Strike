import type { ReactNode } from "react";

// Wavelength's own visual world: warm commerce surfaces, black pill actions, and aloe accents.
// The scoped visual boundary remains the architecture boundary described in Doc 5 §1/§2.
const css = `
.wv-root{min-height:100dvh;background:#fbfbf5;color:#000;
  font-family:var(--font-wavelength),Inter,Helvetica,Arial,sans-serif;font-feature-settings:"ss03";}
.wv-wrap{width:min(1180px,100%);margin:0 auto;padding:24px 28px 80px;}
.wv-head{min-height:64px;display:flex;justify-content:space-between;align-items:center;gap:24px;
  padding:12px 0 20px;border-bottom:1px solid #e4e4e7;}
.wv-brand{display:flex;align-items:center;gap:11px;font-size:21px;font-weight:550;letter-spacing:.01em;}
.wv-logo{position:relative;width:34px;height:22px;display:inline-block;overflow:hidden;border-radius:9999px;background:#000;}
.wv-logo::after{content:"";position:absolute;inset:6px 7px;border-top:2px solid #c1fbd4;border-bottom:2px solid #c1fbd4;transform:skewX(-20deg);}
.wv-nav{color:#52525b;font-size:14px;font-weight:500;letter-spacing:.01em;}
.wv-admin-tag{margin-left:3px;padding:4px 10px;border-radius:9999px;background:#c1fbd4;color:#000;
  font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;}
.wv-main{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(300px,.88fr);gap:64px;align-items:center;margin-top:56px;}
.wv-media{min-height:460px;display:flex;align-items:center;justify-content:center;overflow:hidden;
  padding:34px;border-radius:20px;background:#d4f9e0;}
.wv-media img{width:100%;height:auto;max-width:520px;display:block;filter:drop-shadow(0 24px 28px rgba(0,0,0,.12));}
.wv-eyebrow{display:inline-flex;padding:5px 12px;border-radius:9999px;background:#c1fbd4;color:#000;
  font-size:11px;font-weight:550;letter-spacing:.08em;text-transform:uppercase;}
.wv-title{max-width:650px;margin:14px 0 22px;font-family:var(--font-wavelength),Helvetica,Arial,sans-serif;font-size:clamp(42px,5vw,64px);
  font-weight:330;line-height:1.02;letter-spacing:.01em;}
.wv-priceRow{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;}
.wv-was{color:#71717a;text-decoration:line-through;font-size:21px;font-variant-numeric:tabular-nums;}
.wv-price{font-size:48px;font-weight:550;line-height:1;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
.wv-price.sale{color:#000;box-shadow:inset 0 -12px 0 #c1fbd4;}
.wv-stock{margin-top:16px;font-size:14px;font-weight:550;}
.wv-stock.in{color:#087443}.wv-stock.out{color:#b4233b;}
.wv-buy{min-height:48px;margin-top:26px;padding:12px 26px;border:1px solid #000;border-radius:9999px;
  background:#000;color:#fff;font-size:15px;font-weight:550;cursor:pointer;transition:background .15s ease,color .15s ease;}
.wv-buy:hover:not(:disabled){background:#3f3f46;}.wv-buy:disabled{border-color:#d4d4d8;background:#d4d4d8;color:#71717a;cursor:not-allowed;}
.wv-buy:focus-visible,.wv-btn:focus-visible{outline:3px solid #99b3ad;outline-offset:3px;}
.wv-fine{margin-top:16px;color:#71717a;font-size:12.5px;line-height:1.5;}
.wv-confirm{margin-top:38px;display:flex;gap:14px;align-items:center;padding:20px 22px;border:1px solid #99b3ad;
  border-radius:12px;background:#d4f9e0;}
.wv-check{width:36px;height:36px;display:flex;align-items:center;justify-content:center;flex:none;border-radius:50%;background:#000;color:#fff;font-weight:700;}
.wv-confirm-title{font-size:15px;font-weight:650;}.wv-confirm-sub{margin-top:3px;color:#3f3f46;font-size:13.5px;font-variant-numeric:tabular-nums;}
.wv-catalog{margin-top:72px;padding-top:32px;border-top:1px solid #d4d4d8;}
.wv-catalog-head{display:flex;align-items:baseline;justify-content:space-between;gap:20px;margin-bottom:20px;}
.wv-catalog-head h2{margin:0;font-family:var(--font-wavelength),Helvetica,Arial,sans-serif;font-size:28px;font-weight:400;letter-spacing:.02em;}
.wv-catalog-head span{color:#71717a;font-size:12px;}
.wv-catalog-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;}
.wv-product-card{padding:12px;border:1px solid #e4e4e7;border-radius:12px;background:#fff;
  box-shadow:0 1px 2px rgba(0,0,0,.04),0 8px 8px rgba(0,0,0,.035);}
.wv-product-card img{width:100%;aspect-ratio:1.18;object-fit:contain;padding:8px;border-radius:8px;background:#f7f7ef;}
.wv-product-name{margin-top:12px;font-size:13px;font-weight:550;}.wv-product-price{margin-top:4px;font-size:16px;font-weight:650;font-variant-numeric:tabular-nums;}
.wv-product-note{margin-top:5px;color:#71717a;font-size:10.5px;line-height:1.4;}
.wv-card{margin-top:36px;padding:30px;border:1px solid #e4e4e7;border-radius:12px;background:#fff;
  box-shadow:0 8px 8px rgba(0,0,0,.055),0 4px 4px rgba(0,0,0,.045),0 2px 2px rgba(0,0,0,.04);}
.wv-locked{max-width:760px;}.wv-locked h2{margin:0 0 10px;font-family:var(--font-wavelength),Helvetica,Arial,sans-serif;font-size:25px;font-weight:400;}
.wv-locked p{margin:0;color:#52525b;line-height:1.65;}.wv-locked code{padding:3px 7px;border-radius:4px;background:#f2f2eb;color:#000;font-size:13px;}
.wv-admin-price{margin-bottom:22px;color:#52525b;font-size:15px;line-height:1.5;}.wv-admin-price b{color:#000;font-size:18px;font-variant-numeric:tabular-nums;}
.wv-admin-products{display:grid;gap:14px;}.wv-admin-product{display:grid;grid-template-columns:minmax(170px,.8fr) 1.5fr;gap:24px;align-items:center;
  padding:18px;border:1px solid #e4e4e7;border-radius:12px;background:#fbfbf5;}
.wv-admin-product b{display:block;font-size:15px;font-weight:600;}.wv-admin-product span{display:block;margin-top:4px;color:#71717a;font-size:12px;font-variant-numeric:tabular-nums;}
.wv-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.wv-btn{min-height:44px;padding:10px 16px;border:1px solid #000;border-radius:9999px;background:#fff;color:#000;
  font-size:13px;font-weight:550;cursor:pointer;transition:background .15s ease,color .15s ease,border-color .15s ease;}
.wv-btn:hover:not(:disabled){background:#d4f9e0;border-color:#99b3ad;}.wv-btn:disabled{opacity:.45;cursor:default;}
.wv-btn.drop{border-color:#000;background:#000;color:#fff;font-size:14px;}.wv-btn.drop:hover:not(:disabled){border-color:#3f3f46;background:#3f3f46;}
.wv-btn.reset{margin-top:20px;color:#52525b;}.wv-btn.reset:hover:not(:disabled){color:#000;}
@media (max-width:800px){.wv-wrap{padding-inline:20px}.wv-main{grid-template-columns:1fr;gap:36px;margin-top:36px}.wv-media{min-height:0}.wv-admin-grid{grid-template-columns:1fr}.wv-admin-product{grid-template-columns:1fr}.wv-catalog-grid{grid-template-columns:1fr 1fr}}
@media (max-width:480px){.wv-wrap{padding-inline:16px}.wv-nav{display:none}.wv-main{margin-top:28px}.wv-media{padding:20px}.wv-title{font-size:40px}.wv-price{font-size:40px}.wv-catalog-grid{grid-template-columns:1fr}.wv-catalog-head{align-items:flex-start;flex-direction:column;gap:5px}.wv-card{padding:20px}}
`;

export default function StoreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="wv-root">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {children}
    </div>
  );
}
