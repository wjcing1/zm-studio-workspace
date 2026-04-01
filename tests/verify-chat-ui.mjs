import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "assets.html");
  const scriptPath = path.join(process.cwd(), "scripts", "assets-page.js");
  const stylePath = path.join(process.cwd(), "styles", "assets.css");
  const [source, scriptSource, styleSource] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(scriptPath, "utf8"),
    readFile(stylePath, "utf8"),
  ]);

  const checks = [
    {
      ok: source.includes('class="assets-layout"') || source.includes(".assets-layout"),
      message: "Assets view should define a two-column assets layout.",
    },
    {
      ok: source.includes('id="assistantCompanion"'),
      message: "Assets view should expose the floating AI pulse trigger.",
    },
    {
      ok: source.includes('aria-label="Open assets AI panel"'),
      message: "Assets view should expose an accessible label for the AI trigger.",
    },
    {
      ok: source.includes('id="assistantPanel"'),
      message: "Assets view should contain the AI assistant panel shell.",
    },
    {
      ok: source.includes('id="assistantBody"') && source.includes('id="assistantFooter"'),
      message: "Assets AI should expose dedicated sheet body and footer regions.",
    },
    {
      ok: source.includes('id="assistantStartersRegion"'),
      message: "Assets AI should expose a dedicated starter-prompt region.",
    },
    {
      ok: source.includes('id="assistantMessages"') && source.includes('id="assistantInput"'),
      message: "Assets AI should expose chat messages and composer controls.",
    },
    {
      ok: source.includes('role="log"') || source.includes('aria-live="polite"'),
      message: "Assets AI timeline should expose accessible live-log semantics.",
    },
    {
      ok: scriptSource.includes('fetch("/api/chat"') && scriptSource.includes("response.body.getReader"),
      message: "Assets AI should stream prompts through /api/chat instead of waiting for one final payload.",
    },
    {
      ok: scriptSource.includes('event.code === "Space"'),
      message: "Assets AI should support the Space shortcut.",
    },
    {
      ok:
        styleSource.includes(".assistant-companion") &&
        styleSource.includes(".assistant-panel") &&
        styleSource.includes(".assistant-body") &&
        styleSource.includes(".assistant-footer"),
      message: "Assets page should style the floating AI trigger and the GPT-style sheet regions.",
    },
    {
      ok: scriptSource.includes("showStarters"),
      message: "Assets AI should track starter-prompt visibility in client state.",
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
