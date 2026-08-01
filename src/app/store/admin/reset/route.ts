import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store/wavelength";
import { storeError, isAdmin } from "@/lib/store/http";

export async function POST() {
  if (!(await isAdmin())) return storeError("UNAUTHORIZED", "Admin only", 401);
  resetStore();
  return NextResponse.json({ ok: true });
}
