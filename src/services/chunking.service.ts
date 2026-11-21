export function chunkText(text: string, maxChars = 2000, overlapChars = 200) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    if (current && (current + "\n\n" + paragraph).length > maxChars) {
      chunks.push(current);
      current = current.slice(-overlapChars); // carry some context forward
    }
    current = current ? current + "\n\n" + paragraph : paragraph;
  }
  if (current) chunks.push(current);
  return chunks;
}

// Splits Markdown by its headings, then by size, and starts every chunk with where it
// came from ("leave-policy.md > Sick leave"). A chunk that says "up to 8 days a year"
// is much easier to find, and to trust, when it also says what it is about.
export function chunkMarkdown(text: string, title: string, maxChars = 2000) {
  const sections: { heading: string; body: string }[] = [];
  let heading = "";
  let body: string[] = [];

  for (const line of text.split("\n")) {
    const match = line.match(/^#{1,3}\s+(.*)/);
    if (match) {
      if (body.join("").trim()) sections.push({ heading, body: body.join("\n") });
      heading = match[1].trim();
      body = [];
    } else {
      body.push(line);
    }
  }
  if (body.join("").trim()) sections.push({ heading, body: body.join("\n") });

  return sections.flatMap(({ heading, body }) => {
    const label = heading ? `${title} > ${heading}` : title;
    return chunkText(body, maxChars).map((chunk) => `${label}\n\n${chunk}`);
  });
}
