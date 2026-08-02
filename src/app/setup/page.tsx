// S0 · Setup — pre-flight checklist (Doc 5 §4). Never part of the 3-minute demo.
// M0: env + DB checks are live; passkey/Prava items get wired in M1/M3.
import type { ReactNode } from "react";
import { strikeDb } from "@/db/client";
import { webauthnCredentials } from "@/db/strike-schema";
import { pravaConfigured } from "@/lib/prava";
import { RegisterPasskey } from "./register";

export const dynamic = "force-dynamic";

type CheckState = "ok" | "pending" | "todo";

function Check({
  state,
  label,
  detail,
  action,
}: {
  state: CheckState;
  label: string;
  detail: string;
  action?: ReactNode;
}) {
  const dot =
    state === "ok" ? "bg-strike ring-strike/10" : state === "pending" ? "bg-warn ring-warn/10" : "bg-line ring-line/20";
  const status =
    state === "ok" ? "border-strike/25 bg-strike/10 text-strike" : state === "pending" ? "border-warn/25 bg-warn/10 text-warn" : "border-line bg-bg text-muted";
  return (
    <li className="grid gap-4 border-b border-line px-5 py-5 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-start sm:px-6 sm:py-6">
      <span aria-hidden="true" className={`mt-2.5 h-2.5 w-2.5 shrink-0 rounded-full ring-4 ${dot}`} />
      <div className="min-w-0">
        <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{label}</p>
        <p className="mt-1 text-[13px] leading-5 text-muted">{detail}</p>
      </div>
      {action ?? (
        <span className={`num w-fit rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-wider sm:justify-self-end ${status}`}>
          {state === "ok" ? "ready" : state === "pending" ? "action needed" : "wired later"}
        </span>
      )}
    </li>
  );
}

export default async function SetupPage() {
  let passkeyRegistered = false;
  let dbOk = false;
  try {
    const creds = await strikeDb().select().from(webauthnCredentials).limit(1);
    passkeyRegistered = creds.length > 0;
    dbOk = true;
  } catch {
    dbOk = false;
  }
  const openaiOk = Boolean(process.env.OPENAI_API_KEY);
  const pravaOk = pravaConfigured();

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-5xl flex-col px-5 py-10 sm:px-8 sm:py-14 lg:px-10 lg:py-16">
      <section className="max-w-3xl border-b border-line pb-10 sm:pb-12">
      <p className="num w-fit rounded-full border border-line bg-surface px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-muted">S0 · Pre-flight</p>
      <h1 className="mt-6 text-[clamp(2.5rem,7vw,4.5rem)] font-semibold leading-[1.06] tracking-[-0.05em] text-ink">Setup checklist</h1>
      <p className="mt-5 max-w-2xl text-[16px] leading-7 text-muted">
        Everything here happens before the demo clock. Green across the board = armable.
      </p>
      </section>
      <ul className="mt-10 overflow-hidden rounded-3xl border border-line bg-surface sm:mt-12">
        <Check
          state={dbOk ? "ok" : "pending"}
          label="Databases initialized"
          detail="strike.db + store.db created, WAL on, audit append-only triggers installed"
        />
        <Check
          state={pravaOk ? "ok" : "pending"}
          label="Prava sandbox key"
          detail="PRAVA_SECRET_KEY (sk_test_…) present in .env.local — sandbox only, ever"
        />
        <Check
          state={openaiOk ? "ok" : "pending"}
          label="OpenAI key"
          detail="OPENAI_API_KEY present — NL drafting; fixture mode covers its absence"
        />
        <Check
          state={passkeyRegistered ? "ok" : "pending"}
          label="Passkey registered"
          detail="Touch ID credential enrolled — the only thing that can sign a mandate"
          action={<RegisterPasskey registered={passkeyRegistered} />}
        />
        <Check
          state="todo"
          label="Prava card enrolled + guardrails set"
          detail="Test card saved on Prava's surface; per-purchase approval OFF; wallet cap mirrors mandate cap (M1)"
        />
      </ul>

      {passkeyRegistered && (
        <div className="mt-6 rounded-3xl border border-strike/30 bg-strike/5 p-6 sm:flex sm:items-end sm:justify-between sm:gap-8 sm:p-8">
          <div className="max-w-xl">
          <p className="text-[18px] font-semibold tracking-[-0.02em] text-strike">Passkey ready ✓</p>
          <p className="mt-2 text-[13px] leading-5 text-muted">
            That’s the only thing that can sign a mandate. Next: create one, sign it, and arm it on Prava.
          </p>
          </div>
          <div className="mt-5 flex flex-wrap gap-3 sm:mt-0 sm:shrink-0">
            <a href="/new" className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-6 text-[14px] font-semibold text-bg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
              ◉  Create your first mandate →
            </a>
            <a href="/demo" className="inline-flex min-h-11 items-center justify-center rounded-full border border-line bg-surface px-6 text-[14px] font-semibold text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link">
              Open the demo cockpit
            </a>
          </div>
        </div>
      )}

      <p className="mt-auto border-t border-line pt-8 text-[12px] leading-5 text-muted sm:mt-12">
        Strike · conditional mandates on Prava rails · docs/ is the source of truth
      </p>
    </main>
  );
}
