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
      message: "222.html must start as a real HTML document with <!DOCTYPE html>.",
    },
    {
      ok: !trimmed.startsWith("import React"),
      message: "222.html must not begin with raw React/JSX source.",
    },
    {
      ok: source.includes('data-page="zm-studio"'),
      message: '222.html must expose the final app shell marker `data-page="zm-studio"`.',
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: 222.html is a runnable standalone page.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
