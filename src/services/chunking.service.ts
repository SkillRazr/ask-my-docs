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
