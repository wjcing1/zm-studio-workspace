import { execFileSync } from "node:child_process";
import process from "node:process";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PAGE_URL = "http://127.0.0.1:4173/workspace.html?project=PRJ-002&codex-test-auth=1";

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

try {
  const html = execFileSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--virtual-time-budget=5000",
      "--dump-dom",
      PAGE_URL,
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20000,
    },
  );

  const checks = [
    {
      ok: html.includes("Canvas / Projects / Dark Matter E-commerce"),
      message: "Project route should render the project breadcrumb.",
    },
    {
      ok: html.includes("Dark Matter E-commerce"),
      message: "Project route should render the project title.",
    },
    {
      ok: html.includes("Milan"),
      message: "Project route should render project metadata.",
    },
    {
      ok: countMatches(html, /data-project-context="project"/g) > 0,
      message: "Project route should render project-context canvas nodes.",
    },
    {
      ok: countMatches(html, /<path d="/g) > 0,
      message: "Project route should render connection paths.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Project canvas route loads metadata and connections.");
} catch (error) {
  console.error(error instanceof Error ? `FAIL: ${error.message}` : "FAIL: browser verification failed.");
  process.exit(1);
}
