import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();
  const [dataSource, assetsPageSource, assetsStylesSource] = await Promise.all([
    readFile(path.join(root, "studio-data.mjs"), "utf8"),
    readFile(path.join(root, "scripts", "assets-page.js"), "utf8"),
    readFile(path.join(root, "styles", "assets.css"), "utf8"),
  ]);

  const checks = [
    {
      ok: dataSource.includes("groupName:") && dataSource.includes("actionLabel:") && dataSource.includes("searchText:"),
      message: "Asset seed data should expose project grouping, action labels, and hidden search text.",
    },
    {
      ok: dataSource.includes("meta: {") && dataSource.includes("keywords:"),
      message: "Asset seed data should include hidden structured metadata for AI/search.",
    },
    {
      ok:
        assetsPageSource.includes("asset-feed") &&
        !assetsPageSource.includes("asset-project-section") &&
        assetsPageSource.includes("asset.searchText") &&
        assetsPageSource.includes("Open project") &&
        assetsPageSource.includes("asset-actions") &&
        assetsPageSource.includes("assistantCompanion") &&
        assetsPageSource.includes("stream: true") &&
        assetsPageSource.includes("assistant-shell"),
      message: "Assets page renderer should use a continuous feed while keeping hidden-search behavior, project actions, and the floating AI companion shell.",
    },
    {
      ok:
        assetsStylesSource.includes(".asset-feed") &&
        (assetsStylesSource.includes("column-count: 5") || assetsStylesSource.includes("columns: 5")) &&
        assetsStylesSource.includes(".assistant-companion") &&
        assetsStylesSource.includes(".assistant-panel") &&
        assetsStylesSource.includes("position: fixed") &&
        assetsStylesSource.includes("break-inside: avoid"),
      message: "Assets styles should implement a full-width masonry feed with the floating AI companion panel.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: Assets page exposes a masonry feed with project-linked actions and hidden metadata support.");
}

main().catch((error) => {
  console.error(error instanceof Error ? `FAIL: ${error.message}` : "FAIL: assets project-link verification crashed.");
  process.exit(1);
});
