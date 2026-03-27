import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const filePath = path.join(process.cwd(), "222.html");
  const source = await readFile(filePath, "utf8");
  const trimmed = source.trimStart();

  const checks = [
    {
      ok: trimmed.startsWith("<!DOCTYPE html>"),
      message: "222.html redirect shim must start as a real HTML document with <!DOCTYPE html>.",
    },
    {
      ok: source.includes('url=./workspace.html'),
      message: "222.html should redirect legacy links into workspace.html.",
    },
    {
      ok: source.includes('href="./workspace.html"'),
      message: "222.html should provide a clickable fallback link to workspace.html.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: 222.html is a legacy redirect shim.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
