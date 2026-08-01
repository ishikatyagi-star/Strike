import { NextResponse } from "next/server";
import { generateRegOptions, CeremonyError } from "@/lib/webauthn/ceremony";

export async function POST() {
  try {
    return NextResponse.json(await generateRegOptions());
  } catch (e) {
    const code = e instanceof CeremonyError ? e.code : "REG_FAILED";
    return NextResponse.json({ error: { code, message: (e as Error).message } }, { status: 400 });
  }
}
