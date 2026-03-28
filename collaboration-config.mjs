import path from "node:path";
import process from "node:process";

function asBoolean(value, fallback) {
  if (value === undefined) return fallback;
  return value === "true";
}

export function getCollaborationConfig(env = process.env, rootDir = process.cwd()) {
  const mode = env.COLLAB_MODE || "server";
  const provider = env.COLLAB_PROVIDER || "local-file";
  const storageDir = env.BOARD_STORE_DIR || path.join(rootDir, ".data", "boards");

  return {
    mode,
    provider,
    storageDir,
    features: {
      persistence: true,
      realtime: asBoolean(env.COLLAB_REALTIME, false),
      presence: asBoolean(env.COLLAB_PRESENCE, false),
      localCache: asBoolean(env.COLLAB_LOCAL_CACHE, true),
    },
    endpoints: {
      config: "/api/collaboration/config",
      boards: "/api/boards/:boardId",
    },
  };
}
