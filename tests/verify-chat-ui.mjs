import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "assets.html");
  const source = await readFile(htmlPath, "utf8");

  const checks = [
    {
      ok: source.includes('class="assets-layout"') || source.includes(".assets-layout"),
      message: "Assets view should define a two-column assets layout.",
    },
    {
      ok: source.includes('id="assistantPanel"'),
      message: "Assets view should contain the AI assistant panel shell.",
    },
    {
      ok: source.includes('id="assistantMessages"'),
      message: "Assistant panel should expose a messages container.",
    },
    {
      ok: source.includes('id="assistantInput"'),
      message: "Assistant panel should expose a chat input.",
    },
    {
      ok: source.includes('id="assistantSend"'),
      message: "Assistant panel should expose a send button.",
    },
    {
      ok: source.includes("data-starter-prompt"),
      message: "Assistant panel should include suggested starter prompts.",
    },
    {
      ok: source.includes('src="./scripts/assets-page.js?v='),
      message: "Assets page should load the versioned page-specific assets script.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: AI chat UI markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
