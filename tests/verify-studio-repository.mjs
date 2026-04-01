import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DB_PATH = path.join(process.cwd(), ".tmp", `studio-repository-${process.pid}.sqlite`);

async function main() {
  await rm(DB_PATH, { force: true });

  const moduleUrl = pathToFileURL(path.join(process.cwd(), "studio-repository.mjs")).href;
  const { createStudioRepository } = await import(moduleUrl);

  if (typeof createStudioRepository !== "function") {
    throw new Error("studio-repository.mjs should export createStudioRepository().");
  }

  const repository = createStudioRepository({
    provider: "sqlite",
    dbPath: DB_PATH,
  });

  if (typeof repository?.ensureInitialized !== "function") {
    throw new Error("Studio repository should expose ensureInitialized().");
  }

  if (typeof repository?.getStudioSnapshot !== "function") {
    throw new Error("Studio repository should expose getStudioSnapshot().");
  }

  if (typeof repository?.getBoard !== "function") {
    throw new Error("Studio repository should expose getBoard().");
  }

  await repository.ensureInitialized();

  if (!existsSync(DB_PATH)) {
    throw new Error("Studio repository initialization should create a SQLite database file.");
  }

  const snapshot = await repository.getStudioSnapshot();
  if (snapshot?.meta?.provider !== "sqlite") {
    throw new Error("Studio snapshot should report sqlite as the active provider.");
  }

  if (!Array.isArray(snapshot?.projects) || snapshot.projects.length < 4) {
    throw new Error("Studio repository should expose the seeded projects.");
  }

  if (!Array.isArray(snapshot?.assets) || snapshot.assets.length === 0) {
    throw new Error("Studio repository should expose the seeded assets.");
  }

  const overviewBoard = await repository.getBoard("overview");
  if (overviewBoard?.board?.key !== "overview") {
    throw new Error("Studio repository should expose the overview board by key.");
  }

  if (!Array.isArray(overviewBoard?.board?.nodes) || overviewBoard.board.nodes.length === 0) {
    throw new Error("Studio repository should expose seeded board nodes.");
  }

  console.log("PASS: studio repository bootstrap contract is valid.");
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
