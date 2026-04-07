import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();

    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : null;
      probe.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        if (!port) {
          reject(new Error("Unable to allocate a free TCP port."));
          return;
        }
        resolve(port);
      });
    });
  });
}

export async function waitForServer(url, attempts = 30) {
  for (let index = 0; index < attempts; index += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await wait(250);
  }

  throw new Error(`Server did not become ready at ${url}`);
}

export async function startIsolatedWorkspaceServer({
  cwd = process.cwd(),
  env = {},
  healthPath = "/workspace.html?codex-test-auth=1",
} = {}) {
  const port = await findFreePort();
  const tempStudioDir = mkdtempSync(path.join(tmpdir(), "workspace-test-server-"));
  const server = spawn("node", ["server.mjs"], {
    cwd,
    env: {
      ...process.env,
      PORT: String(port),
      MINIMAX_API_KEY: "",
      STUDIO_DB_PATH: path.join(tempStudioDir, "studio.sqlite"),
      ...env,
    },
    stdio: "ignore",
  });

  let stopped = false;
  const stop = async () => {
    if (stopped) return;
    stopped = true;

    server.kill("SIGTERM");
    await wait(300);
    if (server.exitCode === null) {
      server.kill("SIGKILL");
    }
    rmSync(tempStudioDir, { recursive: true, force: true });
  };

  try {
    await waitForServer(`http://127.0.0.1:${port}${healthPath}`);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    port,
    stop,
  };
}
