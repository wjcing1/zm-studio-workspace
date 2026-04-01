import path from "node:path";
import process from "node:process";
import { createSqliteStudioRepository } from "./sqlite-studio-repository.mjs";

export function createStudioRepository(options = {}) {
  const provider = options.provider || "sqlite";

  if (provider !== "sqlite") {
    throw new Error(`Unsupported studio repository provider: ${provider}`);
  }

  return createSqliteStudioRepository({
    dbPath: options.dbPath || process.env.STUDIO_DB_PATH || path.join(process.cwd(), ".data", "studio.sqlite"),
  });
}
