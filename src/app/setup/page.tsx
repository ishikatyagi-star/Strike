// S0 · Setup — pre-flight checklist (Doc 5 §4). Never part of the 3-minute demo.
// M0: env + DB checks are live; passkey/Prava items get wired in M1/M3.
import { strikeDb } from "@/db/client";
import { webauthnCredentials } from "@/db/strike-schema";
import { pravaConfigured } from "@/lib/prava";

export const dynamic = "force-dynamic";

type CheckState = "ok" | "pending" | "todo";

function Check({ state, label, detail }: { state: CheckState; label: string; detail: string }) {
  const dot =
    state === "ok" ? "bg-strike" : state === "pending" ? "bg-warn" : "bg-line";
  const status =
    state === "ok" ? "text-strike" : state === "pending" ? "text-warn" : "text-muted";
  return (
    <li className="flex items-start gap-3 border-b border-line py-4 last:border-b-0">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="flex-1">
        <p className="text-[15px] font-medium">{label}</p>
        <p className="mt-0.5 text-[13px] text-muted">{detail}</p>
      </div>
      <span className={`num text-xs uppercase tracking-wider ${status}`}>
        {state === "ok" ? "ready" : state === "pending" ? "action needed" : "wired later"}
      </span>
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
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <p className="num text-xs uppercase tracking-[0.2em] text-muted">S0 · Pre-flight</p>
      <h1 className="mt-2 text-2xl font-semibold">Setup checklist</h1>
      <p className="mt-1 text-[15px] text-muted">
        Everything here happens before the demo clock. Green across the board = armable.
      </p>
      <ul className="mt-8 rounded-card border border-line bg-surface px-5">
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
          state={passkeyRegistered ? "ok" : "todo"}
          label="Passkey registered"
          detail="Touch ID credential enrolled (M3) — the only thing that can sign a mandate"
        />
        <Check
          state="todo"
          label="Prava card enrolled + guardrails set"
          detail="Test card saved on Prava's surface; per-purchase approval OFF; wallet cap mirrors mandate cap (M1)"
        />
      </ul>
      <p className="mt-6 text-[13px] text-muted">
        Strike · conditional mandates on Prava rails · docs/ is the source of truth
      </p>
    </main>
  );
}
