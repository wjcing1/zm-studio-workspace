import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const htmlPath = path.join(process.cwd(), "projects.html");
  const scriptPath = path.join(process.cwd(), "scripts", "projects-page.js");
  const stylePath = path.join(process.cwd(), "styles", "projects.css");
  const [htmlSource, scriptSource, styleSource] = await Promise.all([
    readFile(htmlPath, "utf8"),
    readFile(scriptPath, "utf8"),
    readFile(stylePath, "utf8"),
  ]);

  const checks = [
    {
      ok: htmlSource.includes('id="projectsAssistantCompanion"'),
      message: "Projects page should expose the floating AI pulse trigger.",
    },
    {
      ok: htmlSource.includes('aria-label="Open project AI panel"'),
      message: "Projects page should expose an accessible label for the AI trigger.",
    },
    {
      ok: htmlSource.includes('id="projectsAssistantPanel"'),
      message: "Projects page should include the AI project manager panel shell.",
    },
    {
      ok: htmlSource.includes('id="projectsAssistantMessages"') && htmlSource.includes('id="projectsAssistantInput"'),
      message: "Projects page should include chat thread and composer controls.",
    },
    {
      ok: htmlSource.includes('id="projectsAssistantBody"') && htmlSource.includes('id="projectsAssistantFooter"'),
      message: "Projects AI should expose dedicated sheet body and footer regions.",
    },
    {
      ok: htmlSource.includes('id="projectsAssistantStartersRegion"'),
      message: "Projects AI should expose a dedicated starter-prompt region.",
    },
    {
      ok: htmlSource.includes('role="log"') || htmlSource.includes('aria-live="polite"'),
      message: "Projects AI timeline should expose accessible live-log semantics.",
    },
    {
      ok: scriptSource.includes('fetch("/api/chat"') && scriptSource.includes("response.body.getReader"),
      message: "Projects AI should stream prompts through /api/chat instead of waiting for one final payload.",
    },
    {
      ok: scriptSource.includes('event.code === "Space"'),
      message: "Projects AI should support the Space shortcut.",
    },
    {
      ok:
        styleSource.includes(".projects-assistant-companion") &&
        styleSource.includes(".projects-assistant-panel") &&
        styleSource.includes(".projects-assistant-body") &&
        styleSource.includes(".projects-assistant-footer"),
      message: "Projects page should style the floating AI trigger and the GPT-style sheet regions.",
    },
    {
      ok: scriptSource.includes("showStarters"),
      message: "Projects AI should track starter-prompt visibility in client state.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Projects AI UI markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
