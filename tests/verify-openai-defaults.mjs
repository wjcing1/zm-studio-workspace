import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");
  const envExampleSource = await readFile(path.join(root, ".env.example"), "utf8");

  if (!serverSource.includes('const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || "https://subtp7eu3nc8.tokenclub.top/v1";')) {
    throw new Error("server.mjs should default OPENAI_BASE_URL to the tokenclub gateway.");
  }

  if (!serverSource.includes('const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";')) {
    throw new Error("server.mjs should default OPENAI_MODEL to gpt-5.5.");
  }

  if (!envExampleSource.includes("OPENAI_MODEL=gpt-5.5")) {
    throw new Error(".env.example should document gpt-5.5 as the default model.");
  }

  if (!envExampleSource.includes("OPENAI_BASE_URL=https://subtp7eu3nc8.tokenclub.top/v1")) {
    throw new Error(".env.example should document the tokenclub gateway as the default base URL.");
  }

  console.log("PASS: OpenAI defaults point at the tokenclub gateway and gpt-5.5 model.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
