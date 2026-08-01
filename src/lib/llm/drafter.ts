// LLM boundary (Doc 3 §5): this module proposes an untrusted draft only. It has no tools and is
// never imported by executor/. The route Zod-validates its output before a human sees or signs it.
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { DraftInput, type DraftInputT, validateDraftSemantics } from "@/lib/mandate/schema";

const Proposal = z.object({
  trigger_cents: z.number().int().positive(),
  max_total_cents: z.number().int().positive(),
  valid_for_days: z.number().int().min(1).max(7),
});

export class DraftingError extends Error {}

function fixture(utterance: string): z.infer<typeof Proposal> {
  const amounts = [...utterance.matchAll(/\$\s*(\d+(?:\.\d{1,2})?)/g)].map((m) => Math.round(Number(m[1]) * 100));
  const trigger = amounts[0] ?? 18_000;
  const days = Number(utterance.match(/(?:within|for|before)\s+(\d+)\s+days?/i)?.[1] ?? 3);
  return { trigger_cents: trigger, max_total_cents: amounts[1] ?? trigger, valid_for_days: Math.min(7, Math.max(1, days)) };
}

/** Convert prose into the same safe, form-shaped object used by POST /draft. */
export async function draftFromUtterance(utterance: string): Promise<DraftInputT> {
  let proposal: z.infer<typeof Proposal>;
  if (process.env.LLM_MODE === "fixture") {
    proposal = fixture(utterance);
  } else {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 8_000 });
      const response = await client.responses.parse({
        model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
        input: [
          {
            role: "developer",
            content: "Extract a proposed Wavelength AirPods Pro purchase mandate. Return only the requested fields. Amounts are integer USD cents. Do not authorize, call tools, or make purchases.",
          },
          { role: "user", content: utterance },
        ],
        text: { format: zodTextFormat(Proposal, "strike_mandate_proposal") },
      });
      if (!response.output_parsed) throw new Error("model did not return a proposal");
      proposal = response.output_parsed;
    } catch {
      // never hard-fail the demo on a rate-limit/timeout blip — fall back to the local parser.
      proposal = fixture(utterance);
    }
  }

  const candidate = DraftInput.safeParse({
    merchant_id: "wavelength",
    item_sku: "airpods-pro",
    condition: { type: "price_below", price_cents: proposal.trigger_cents },
    max_total_cents: proposal.max_total_cents,
    quantity: 1,
    valid_until: new Date(Date.now() + proposal.valid_for_days * 86_400_000).toISOString(),
  });
  if (!candidate.success || validateDraftSemantics(candidate.data)) throw new DraftingError("the proposal is outside Strike's limits");
  return candidate.data;
}
