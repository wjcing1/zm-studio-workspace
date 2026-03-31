import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const [dataSource, assetsPageSource] = await Promise.all([
    readFile(path.join(root, "studio-data.mjs"), "utf8"),
    readFile(path.join(root, "scripts", "assets-page.js"), "utf8"),
  ]);

  const checks = [
    {
      ok:
        dataSource.includes('title: "利雅得电梯展汇报方案"') &&
        dataSource.includes('title: "舒勇 SHOW ROOM 提案"'),
      message: "Asset dataset should contain archive-backed asset titles.",
    },
    {
      ok: /projectId:\s*"PRJ-00[1-4]"/.test(dataSource) && dataSource.includes("fileUrl:"),
      message: "Asset dataset should link assets to a projectId and an original fileUrl.",
    },
    {
      ok:
        assetsPageSource.includes("Open project") &&
        assetsPageSource.includes("Open file") &&
        assetsPageSource.includes("asset-actions"),
      message: "Assets page renderer should expose project and file actions for each card.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Assets page exposes real project-linked asset cards.");
}

main().catch((error) => {
  console.error(error instanceof Error ? `FAIL: ${error.message}` : "FAIL: assets project-link verification crashed.");
  process.exit(1);
});
