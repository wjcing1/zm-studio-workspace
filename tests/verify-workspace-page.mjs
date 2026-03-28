import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const filePath = path.join(process.cwd(), "workspace.html");
  const source = await readFile(filePath, "utf8");
  const trimmed = source.trimStart();

  const checks = [
    {
      ok: trimmed.startsWith("<!DOCTYPE html>"),
      message: "workspace.html must start as a real HTML document with <!DOCTYPE html>.",
    },
    {
      ok: source.includes('data-page="zm-workspace"'),
      message: "workspace.html should expose the workspace page marker.",
    },
    {
      ok: source.includes('href="./styles/shared.css?v='),
      message: "workspace.html should load the versioned shared stylesheet.",
    },
    {
      ok: source.includes('href="./styles/workspace.css?v='),
      message: "workspace.html should load the versioned page-specific workspace stylesheet.",
    },
    {
      ok: source.includes('src="./scripts/workspace-page.js?v='),
      message: "workspace.html should load the versioned page-specific workspace script.",
    },
    {
      ok: source.includes('id="collaborationPresenceLayer"'),
      message: "workspace.html should expose a dedicated collaboration presence layer.",
    },
    {
      ok: source.includes('id="collaborationStatus"'),
      message: "workspace.html should expose a collaboration status pill.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: workspace.html is a structured standalone page.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
