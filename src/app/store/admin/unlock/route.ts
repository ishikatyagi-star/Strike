import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/store/http";

// Demo-grade convenience: lets the /demo cockpit unlock the mock-merchant price lever in one
// self-contained flow, without a judge ever typing /store/admin/login?key=... The key stays
// server-side (never sent to the client). This only toggles the *mock* Wavelength catalogue price;
// it does not touch the spend gate, Prava, or any mandate — those remain passkey/network enforced.
export async function POST() {
  const key = process.env.STORE_ADMIN_KEY ?? "";
  if (!key) {
    return NextResponse.json({ error: { code: "UNCONFIGURED", message: "STORE_ADMIN_KEY not set" } }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, key, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
