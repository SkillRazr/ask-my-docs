import type { RetrievedChunk } from "./retrieve";

// About 4 characters per token, so 12,000 characters is roughly 3,000 tokens.
const MAX_CONTEXT_CHARS = 12_000;

export function buildContext(chunks: RetrievedChunk[]) {
  const used: RetrievedChunk[] = [];
  let size = 0;
  for (const chunk of chunks) {
    if (size + chunk.content.length > MAX_CONTEXT_CHARS) break;
    used.push(chunk);
    size += chunk.content.length;
  }
  const text = used
    .map((chunk, i) => `<source id="${i + 1}" title="${chunk.title}">\n${chunk.content}\n</source>`)
    .join("\n\n");
  return { text, used };
}
