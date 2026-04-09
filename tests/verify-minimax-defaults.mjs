import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const serverSource = await readFile(path.join(root, "server.mjs"), "utf8");
  const envExampleSource = await readFile(path.join(root, ".env.example"), "utf8");

  if (!serverSource.includes('const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://shell.wyzai.top/v1";')) {
    throw new Error("server.mjs should default MINIMAX_BASE_URL to the verified shell.wyzai.top gateway.");
  }

  if (!serverSource.includes('const MODEL = process.env.MINIMAX_MODEL || "gpt-5.4";')) {
    throw new Error("server.mjs should default MINIMAX_MODEL to gpt-5.4 for Render-safe deploys.");
  }

  if (!envExampleSource.includes("MINIMAX_MODEL=gpt-5.4")) {
    throw new Error(".env.example should document gpt-5.4 as the default model.");
  }

  if (!envExampleSource.includes("MINIMAX_BASE_URL=https://shell.wyzai.top/v1")) {
    throw new Error(".env.example should document the shell.wyzai.top gateway as the default base URL.");
  }

  console.log("PASS: MiniMax defaults point at the verified shell.wyzai.top gateway and gpt-5.4 model.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
