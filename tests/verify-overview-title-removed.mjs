import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const [htmlSource, appSource, dataSource] = await Promise.all([
    readFile(path.join(process.cwd(), "workspace.html"), "utf8"),
    readFile(path.join(process.cwd(), "scripts", "workspace-page.js"), "utf8"),
    readFile(path.join(process.cwd(), "studio-data.mjs"), "utf8"),
  ]);

  const checks = [
    {
      ok: !htmlSource.includes(">Studio Overview<"),
      message: "Static HTML should not render Studio Overview as the default canvas title.",
    },
    {
      ok: !appSource.includes('canvasContextTitle.textContent = "Studio Overview"'),
      message: "Canvas renderer should not inject Studio Overview in overview mode.",
    },
    {
      ok: !dataSource.includes("Studio Overview\\n\\n"),
      message: "Overview canvas note content should not include Studio Overview.",
    },
    {
      ok: !dataSource.includes('title: "Studio Overview Canvas"'),
      message: "Overview canvas seed data should not keep the old Studio Overview title.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Overview canvas text no longer includes Studio Overview.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
