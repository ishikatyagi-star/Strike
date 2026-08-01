// Doc 4 §3 error envelope + demo-grade admin auth (Doc 4 A3: static cookie, "not production auth").
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export function storeError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

export const ADMIN_COOKIE = "wv_admin";

export async function isAdmin(): Promise<boolean> {
  const key = process.env.STORE_ADMIN_KEY ?? "";
  if (!key) return false;
  const c = await cookies();
  return c.get(ADMIN_COOKIE)?.value === key;
}
