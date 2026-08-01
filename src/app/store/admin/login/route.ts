import { NextResponse } from "next/server";
import { ADMIN_COOKIE } from "@/lib/store/http";

// Doc 4 A3: /store/admin/login?key=<STORE_ADMIN_KEY> sets a static admin cookie. Demo-grade.
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? "";
  const expected = process.env.STORE_ADMIN_KEY ?? "";
  if (!expected || key !== expected) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Bad admin key" } }, { status: 401 });
  }
  const res = NextResponse.redirect(new URL("/store/admin", req.url));
  res.cookies.set(ADMIN_COOKIE, expected, { httpOnly: true, sameSite: "lax", path: "/" });
  return res;
}
