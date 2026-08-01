"use client";
// S0 passkey registration (Doc 2 §3.1). The one thing that can later sign a mandate.
import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";

export function RegisterPasskey({ registered }: { registered: boolean }) {
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
    return <span className="num text-xs uppercase tracking-wider text-strike">registered</span>;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={register}
        disabled={state === "working"}
        className="rounded border border-line bg-surface px-3 py-1.5 text-[13px] font-medium hover:border-strike disabled:opacity-50"
      >
        {state === "working" ? "Follow the prompt…" : "Register Touch ID"}
      </button>
      {state === "error" && <span className="max-w-[200px] text-right text-[11px] text-danger">{msg}</span>}
    </div>
  );
}
