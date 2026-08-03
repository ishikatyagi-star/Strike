export type QueryValue = string | string[] | undefined;
export type DemoScenario = "success" | "protection" | "custom";
export type ExpiryChoice = "today" | "3-days" | "7-days" | "date";

export const DEMO_PRESETS: Record<DemoScenario, { triggerCents: number; capCents: number }> = {
  success: { triggerCents: 18_000, capCents: 18_000 },
  protection: { triggerCents: 18_000, capCents: 17_000 },
  custom: { triggerCents: 18_000, capCents: 18_000 },
};

export function normalizeGuidedQuery(query: Record<string, QueryValue>) {
  const scenario = first(query.scenario);
  const mandate = first(query.mandate)?.trim();
  return {
    guided: first(query.guided) === "1",
    scenario: scenario === "protection" || scenario === "custom" ? scenario : "success",
    mandateId: mandate || null,
  } as const;
}

function first(value: QueryValue) {
  return Array.isArray(value) ? value[0] : value;
}

export function previewPrice(
  priceCents: number,
  triggerCents: number,
  capCents: number,
  quantity: number,
) {
  const totalCents = priceCents * quantity;
  const triggerMet = priceCents < triggerCents;
  return {
    totalCents,
    triggerMet,
    outcome: !triggerMet ? "watching" : totalCents <= capCents ? "eligible" : "protected",
  } as const;
}

export function resolveExpiry(
  choice: ExpiryChoice,
  customDate: string,
  now = new Date(),
) {
  const max = new Date(now.getTime() + 7 * 86_400_000);
  let target: Date;

  if (choice === "today") {
    target = new Date(now);
    target.setHours(23, 59, 59, 999);
  } else if (choice === "date" && /^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
    const [year, month, day] = customDate.split("-").map(Number);
    target = new Date(year, month - 1, day, 23, 59, 59, 999);
  } else {
    target = new Date(now.getTime() + (choice === "7-days" ? 7 : 3) * 86_400_000);
  }

  if (target <= now) target = new Date(now.getTime() + 60_000);
  if (target > max) target = max;
  return target.toISOString();
}

type SelectableMandate = { mandate: { id: string; status: string; created_at?: string } };
const ACTIVE = new Set(["armed", "triggered", "executing"]);
const COMPLETED = new Set(["fulfilled", "failed"]);

export function selectMandateId(rows: SelectableMandate[], requested?: string | null) {
  if (requested && rows.some((row) => row.mandate.id === requested)) return requested;
  const newest = (statuses: Set<string>) => rows
    .filter((row) => statuses.has(row.mandate.status))
    .sort((a, b) => Date.parse(b.mandate.created_at ?? "") - Date.parse(a.mandate.created_at ?? ""))[0]?.mandate.id ?? null;
  return newest(ACTIVE) ?? newest(COMPLETED);
}

export function oppositeScenario(status: string): Exclude<DemoScenario, "custom"> {
  return status === "fulfilled" ? "protection" : "success";
}
