import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { ANSWER_MODEL, client } from "./services/llm";
import { tracked } from "./services/usage";
import { pool } from "./db/pool";

// Multimodal input: send an image with a question. A model that reads images can
// turn a scanned policy, a whiteboard photo or a chart into text you can index.
// Usage: npm run describe -- path/to/image.png "What does this show?"
const [path, ...words] = process.argv.slice(2);
if (!path)
  throw new Error("Usage: npm run describe -- path/to/image.png [question]");
const question =
  words.join(" ") || "Describe this image. Copy out any text in it exactly.";
const types: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const type = types[extname(path).toLowerCase()];
if (!type) throw new Error("Use a .png, .jpg or .webp image");

const image = (await readFile(path)).toString("base64");
const response = await tracked("describe", () =>
  client.responses.create({
    model: ANSWER_MODEL, // gpt-4.1-mini and gpt-4.1 can read images
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: question },
          {
            type: "input_image",
            image_url: `data:${type};base64,${image}`,
            detail: "auto",
          },
        ],
      },
    ],
  })
);
console.log(response.output_text);
await pool.end();
