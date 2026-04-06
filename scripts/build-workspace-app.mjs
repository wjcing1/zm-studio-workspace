import { access, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const ROOT_DIR = process.cwd();
const GENERATED_DIR = path.join(ROOT_DIR, "scripts", "generated", "workspace");
const GENERATED_ENTRY = path.join(GENERATED_DIR, "workspace-app.js");
const WATCHED_PATHS = [
  path.join(ROOT_DIR, "src", "workspace"),
  path.join(ROOT_DIR, "vite.workspace.config.mjs"),
  path.join(ROOT_DIR, "tsconfig.workspace.json"),
  path.join(ROOT_DIR, "package.json"),
];

async function pathMtimeMs(targetPath) {
  try {
    const info = await stat(targetPath);
    return info.mtimeMs;
  }
  catch {
    return 0;
  }
}

async function latestSourceMtimeMs() {
  const values = await Promise.all(WATCHED_PATHS.map(pathMtimeMs));
  return Math.max(...values);
}

async function shouldBuild(force = false) {
  if (force)
    return true;

  try {
    await access(GENERATED_ENTRY);
  }
  catch {
    return true;
  }

  const [entryMtimeMs, sourceMtimeMs] = await Promise.all([
    pathMtimeMs(GENERATED_ENTRY),
    latestSourceMtimeMs(),
  ]);

  return sourceMtimeMs > entryMtimeMs;
}

export async function ensureWorkspaceAppBuild({ force = false } = {}) {
  if (!(await shouldBuild(force)))
    return GENERATED_ENTRY;

  await mkdir(GENERATED_DIR, { recursive: true });
  await build({
    configFile: path.join(ROOT_DIR, "vite.workspace.config.mjs"),
    logLevel: "error",
  });

  return GENERATED_ENTRY;
}

const currentPath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentPath === invokedPath) {
  ensureWorkspaceAppBuild({ force: true }).catch((error) => {
    console.error(error instanceof Error ? error.message : "Unable to build Workspace app.");
    process.exit(1);
  });
}
