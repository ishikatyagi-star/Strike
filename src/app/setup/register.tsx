"use client";
// S0 passkey registration (Doc 2 §3.1). The one thing that can later sign a mandate.
import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

export function RegisterPasskey({ registered, guided = false }: { registered: boolean; guided?: boolean }) {
  const [state, setState] = useState<"idle" | "working" | "done" | "error">(registered ? "done" : "idle");
  const [msg, setMsg] = useState("");

  async function register() {
    setState("working");
    setMsg("");
    try {
      const optionsJSON = await (await fetch("/api/webauthn/register/options", { method: "POST" })).json();
      if (optionsJSON.error) throw new Error(optionsJSON.error.message);
      const att = await startRegistration({ optionsJSON });
      const res = await (
        await fetch("/api/webauthn/register/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(att),
        })
      ).json();
      if (!res.ok) throw new Error(res.error?.message ?? "registration failed");
      setState("done");
      window.location.reload(); // refresh the checklist
    } catch (e) {
      setState("error");
      setMsg((e as Error).message);
    }
  }

  if (state === "done") {
    return <span className="num w-fit rounded-full border border-strike/25 bg-strike/10 px-3 py-1.5 text-[10px] uppercase tracking-wider text-strike sm:justify-self-end">{guided ? "passkey ready" : "registered"}</span>;
  }
  return (
    <div className="flex w-full flex-col items-start gap-2 sm:w-auto sm:items-end sm:justify-self-end">
      <button
        onClick={register}
        disabled={state === "working"}
        aria-busy={state === "working"}
        aria-describedby={state === "error" ? "passkey-registration-error" : undefined}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-ink px-5 text-[13px] font-semibold text-bg transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-link disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {state === "working" ? "Follow the prompt…" : guided ? "Register my passkey" : "Register Touch ID"}
      </button>
      {state === "error" && <span id="passkey-registration-error" role="alert" className="max-w-[240px] text-left text-[11px] leading-4 text-danger sm:text-right">{msg}</span>}
    </div>
  );
}
