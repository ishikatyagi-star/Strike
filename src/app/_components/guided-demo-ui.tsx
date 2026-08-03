import type { ReactNode } from "react";

const STEPS = ["Passkey", "Set rule", "Sign & arm", "Test market", "Verify"];

export function DemoProgress({ current }: { current: number }) {
  return (
    <nav aria-label="Guided demo progress" className="demo-progress">
      <ol>
        {STEPS.map((label, index) => {
          const step = index + 1;
          return (
            <li key={label} aria-current={step === current ? "step" : undefined} data-complete={step < current || undefined}>
              <span aria-hidden="true">{step}</span>
              <strong>{label}</strong>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function TruthLabel({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "blue" }) {
  return <span className={`truth-label truth-label-${tone}`}>{children}</span>;
}
