import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const dataSource = await readFile(path.join(process.cwd(), "studio-data.mjs"), "utf8");

  const expectedProjects = [
    "迪拜2026电梯展",
    "哈萨克斯坦电梯展",
    "草药展",
    "舒勇SHOW ROOM",
  ];

  const removedProjects = [
    "Neon Genesis Rebrand",
    "Dark Matter E-commerce",
    "Spatial OS Prototype",
    "Lumina Data Viz",
  ];

  const checks = [
    {
      ok: expectedProjects.every((name) => dataSource.includes(`name: "${name}"`)),
      message: "studio-data.mjs should contain the archive-backed ZM Studio project names.",
    },
    {
      ok: removedProjects.every((name) => !dataSource.includes(name)),
      message: "studio-data.mjs should no longer contain the demo project names.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Real project dataset replaced the demo portfolio names.");
}

main().catch((error) => {
  console.error(error instanceof Error ? `FAIL: ${error.message}` : "FAIL: dataset verification crashed.");
  process.exit(1);
});
