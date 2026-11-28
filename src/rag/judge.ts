import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { client, SMALL_MODEL } from "../services/llm";
import { tracked } from "../services/usage";
import type { Source } from "./answer";

const Verdict = z.object({
  faithful: z.boolean(),
  unsupported_claims: z.array(z.string()),
});

// LLM-as-judge: checks every claim in the answer against the sources it cited.
// An answer is faithful when nothing in it goes beyond those sources.
export async function judgeFaithfulness(answer: string, sources: Source[]) {
  const sourceText = sources
    .map((s) => `<source id="${s.number}">\n${s.content}\n</source>`)
    .join("\n\n");

  const response = await tracked("judge", () =>
    client.responses.parse({
      model: SMALL_MODEL,
      instructions:
        "You check answers for hallucinations. List every claim in the answer that the sources do not support. The answer is faithful only if that list is empty.",
      input: `Sources:\n${sourceText}\n\nAnswer:\n${answer}`,
      text: { format: zodTextFormat(Verdict, "faithfulness") },
    })
  );
  return (
    response.output_parsed ?? {
      faithful: false,
      unsupported_claims: ["(no verdict)"],
    }
  );
}
