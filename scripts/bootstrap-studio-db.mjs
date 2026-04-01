import process from "node:process";
import { createStudioRepository } from "../studio-repository.mjs";

const repository = createStudioRepository({
  dbPath: process.env.STUDIO_DB_PATH,
});

await repository.ensureInitialized();

console.log(`Bootstrapped studio database at ${repository.dbPath}`);
