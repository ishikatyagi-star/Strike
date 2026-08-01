// Presentation-only narration (Doc 3 §5). This text is generated from an already-recorded audit
// trail; it cannot mutate, authorize, trigger, or execute a mandate.
import OpenAI from "openai";

export type NarrationInput = { status: string; item: string; latestPrice?: number | null; triggerCents: number; amountCents?: number | null };

function template(input: NarrationInput): string {
  const price = input.latestPrice == null ? "the live price" : `$${(input.latestPrice / 100).toFixed(2)}`;
  if (input.status === "fulfilled") return `${input.item} was struck at ${price} and paid within the signed limit.`;
  if (input.status === "failed") return `Prava refused a payment outside the signed mandate.`;
  if (input.status === "revoked") return `This mandate was revoked before it could spend.`;
  return `Watching ${input.item}: strike below $${(input.triggerCents / 100).toFixed(2)}.`;
}

export async function narrate(input: NarrationInput): Promise<string> {
  // Off by default: this runs on every 2s detail poll, so live narration would hammer the OpenAI
  // rate limit. The meaningful OpenAI use is the NL drafter (draftFromUtterance), which runs once
  // per mandate. Set NARRATE_LIVE=1 only with a payment-method'd key (higher RPM).
  if (process.env.NARRATE_LIVE !== "1") return template(input);
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 2_000 });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
      input: `Write one factual sentence under 20 words about this audit state. Do not give advice or authorize anything. ${JSON.stringify(input)}`,
      max_output_tokens: 60,
    });
    return response.output_text.trim() || template(input);
  } catch {
    return template(input);
  }
}
