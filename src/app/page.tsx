// S2 · Mandate book — M0 placeholder: empty state only (Doc 5 §4).
import Link from "next/link";

export default function MandateBook() {
  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Strike<span className="text-strike">.</span>
        </h1>
        <Link href="/setup" className="text-[13px] text-link">
          Setup
        </Link>
      </div>
      <div className="mt-10 rounded-card border border-line bg-surface px-6 py-16 text-center">
        <p className="text-[15px] text-muted">No standing mandates.</p>
        <p className="mx-auto mt-2 max-w-md text-[13px] text-muted">
          A mandate is a passkey-signed authorization: merchant, item, price ceiling,
          expiry. Sign once — Strike watches and executes only inside those bounds.
        </p>
        <span className="mt-6 inline-block cursor-not-allowed rounded-card border border-line px-4 py-2 text-[13px] text-muted">
          New mandate — arrives in M3
        </span>
      </div>
    </main>
  );
}
