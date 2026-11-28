import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { client, SMALL_MODEL } from "../services/llm";
import { tracked } from "../services/usage";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const Standalone = z.object({ question: z.string() });

// "And for interns?" means nothing on its own. With the conversation, it becomes
// "How many days of paid leave do interns get?", which retrieval can find.
export async function toStandaloneQuestion(
  question: string,
  history: ChatTurn[]
) {
  if (history.length === 0) return question; // nothing to resolve: skip the call

  const transcript = history
    .slice(-6) // the last few turns are enough, and keep the prompt small
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join("\n");

  const response = await tracked("rewrite", () =>
    client.responses.parse({
      model: SMALL_MODEL,
      instructions:
        "Rewrite the user's latest question as a standalone question that makes sense without the conversation. Keep its meaning. Don't answer it.",
      input: `Conversation:\n${transcript}\n\nLatest question: ${question}`,
      text: { format: zodTextFormat(Standalone, "standalone_question") },
    })
  );
  return response.output_parsed?.question.trim() || question;
}
