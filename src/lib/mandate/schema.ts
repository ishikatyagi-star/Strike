// Zod at the boundary (AGENTS.md). Draft input is form-first for M3; NL drafting (M7) produces
// the same shape via the LLM → this same gate. Only price_below is live in v1 (Doc 2 §2).
import { z } from "zod";

export const PriceBelow = z.object({
  type: z.literal("price_below"),
  price_cents: z.number().int().positive(),
});

// back_in_stock / fare_below exist in the schema but are rejected by validation in v1 (Doc 2 §2).
export const ConditionInput = PriceBelow;
export type Condition = z.infer<typeof ConditionInput>;

export const DraftInput = z.object({
  merchant_id: z.literal("wavelength"),
  item_sku: z.literal("airpods-pro"),
  condition: ConditionInput,
  max_total_cents: z.number().int().positive(),
  quantity: z.number().int().positive().max(10).default(1),
  valid_until: z.string().datetime(), // UTC ISO-8601
});
export type DraftInputT = z.infer<typeof DraftInput>;

const MAX_HORIZON_DAYS = 7; // PRAVA_MODE=mandate one-time horizon (Doc 2 §1/§7)

// Semantic checks Zod can't express structurally. Returns an error code (Doc 4 §3) or null.
export function validateDraftSemantics(input: DraftInputT, nowMs = Date.now()): string | null {
  const until = Date.parse(input.valid_until);
  if (Number.isNaN(until)) return "VALIDATION_FAILED";
  if (until <= nowMs) return "VALIDATION_FAILED"; // must be in the future
  if (until - nowMs > MAX_HORIZON_DAYS * 864e5) return "VALIDATION_FAILED"; // ≤ 7 days
  // cap must be at least the trigger price (buying under the trigger must fit under the cap)
  if (input.max_total_cents < input.condition.price_cents) return "VALIDATION_FAILED";
  return null;
}
