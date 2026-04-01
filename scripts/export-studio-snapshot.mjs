import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createStudioRepository } from "../studio-repository.mjs";

export async function exportStudioSnapshot(outputPath) {
  const repository = createStudioRepository({
    dbPath: process.env.STUDIO_DB_PATH,
  });
  await repository.ensureInitialized();
  const snapshot = await repository.getStudioSnapshot();

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, JSON.stringify(snapshot, null, 2));

  return outputPath;
}

const currentFile = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  const outputPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(process.cwd(), "dist", "data", "studio-data.json");

  await exportStudioSnapshot(outputPath);
  console.log(`Exported studio snapshot to ${outputPath}`);
}
