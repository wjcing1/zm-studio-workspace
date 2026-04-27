import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

const PORT = 4326;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const DB_PATH = path.join(process.cwd(), ".tmp", `studio-data-api-${PORT}.sqlite`);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }

  throw new Error(`Server did not become ready at ${url}`);
}

async function main() {
  await rm(DB_PATH, { force: true });

  const server = spawn("node", ["server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(PORT),
      OPENAI_API_KEY: "",
      STUDIO_DB_PATH: DB_PATH,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(`${BASE_URL}/`);

    const response = await fetch(`${BASE_URL}/api/studio-data`);
    if (!response.ok) {
      throw new Error(`/api/studio-data should return 200, got ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.meta?.provider !== "sqlite") {
      throw new Error("/api/studio-data should report sqlite as the active provider.");
    }

    if (!Array.isArray(payload?.assistant?.skills) || payload.assistant.skills.length === 0) {
      throw new Error("/api/studio-data should expose workspace assistant skills to the frontend.");
    }

    const architecturalSkill = payload.assistant.skills.find((skill) => skill.id === "architectural_prompt_architect");
    if (!architecturalSkill || !architecturalSkill.defaultEnabled) {
      throw new Error("/api/studio-data should expose architectural_prompt_architect as a default-enabled skill.");
    }

    if (!Array.isArray(payload?.projects) || payload.projects.length < 5) {
      throw new Error("/api/studio-data should return the seeded projects.");
    }

    if (!payload.projects.some((project) => project.id === "PRJ-005")) {
      throw new Error("/api/studio-data should return the MIDO batch-import project seed.");
    }

    if (!Array.isArray(payload?.assets) || payload.assets.length < 40) {
      throw new Error("/api/studio-data should return a substantial visual asset library.");
    }

    const groupedAsset = Array.isArray(payload?.assets)
      ? payload.assets.find((asset) => asset.projectId && asset.groupName && asset.actionLabel)
      : null;
    if (!groupedAsset) {
      throw new Error("/api/studio-data should return grouped project-linked assets.");
    }

    if (typeof groupedAsset.searchText !== "string" || !groupedAsset.searchText.trim()) {
      throw new Error("/api/studio-data should return hidden search text for grouped assets.");
    }

    if (!groupedAsset.meta || !Array.isArray(groupedAsset.meta.keywords) || groupedAsset.meta.keywords.length === 0) {
      throw new Error("/api/studio-data should return hidden structured asset metadata.");
    }

    if (!existsSync(DB_PATH)) {
      throw new Error("/api/studio-data should bootstrap a SQLite database file.");
    }

    console.log("PASS: studio data API is backed by sqlite.");
  } finally {
    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
    if (stderr.trim()) {
      process.stderr.write(stderr);
    }
    await rm(DB_PATH, { force: true });
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
