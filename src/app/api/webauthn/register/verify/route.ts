import { NextResponse } from "next/server";
import { verifyRegistration, CeremonyError } from "@/lib/webauthn/ceremony";

export async function POST(req: Request) {
  try {
    const result = await verifyRegistration(await req.json());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const code = e instanceof CeremonyError ? e.code : "REG_FAILED";
    return NextResponse.json({ error: { code, message: (e as Error).message } }, { status: 400 });
  }
}
