import { execFileSync } from "node:child_process";
import { spawn } from "node:child_process";
import process from "node:process";

const checks = [
  ["node", ["tests/verify-splash-page.mjs"]],
  ["node", ["tests/verify-encoded-splash-route.mjs"]],
  ["node", ["tests/verify-222.mjs"]],
  ["node", ["tests/verify-workspace-page.mjs"]],
  ["node", ["tests/verify-web-app-shell.mjs"]],
  ["node", ["tests/verify-project-canvas-ui.mjs"]],
  ["node", ["tests/verify-chat-ui.mjs"]],
  ["node", ["tests/verify-overview-title-removed.mjs"]],
  ["node", ["tests/verify-chat-api.mjs"]],
];

function runCheck(command, args) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });
}

async function wait(ms) {
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
  for (const [command, args] of checks) {
    runCheck(command, args);
  }

  let server = null;

  try {
    try {
      await waitForServer("http://127.0.0.1:4173/", 4);
    } catch {
      server = spawn("node", ["server.mjs"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PORT: "4173",
          MINIMAX_API_KEY: "",
        },
        stdio: "ignore",
      });

      await waitForServer("http://127.0.0.1:4173/");
    }

    runCheck("node", ["tests/verify-assets-layout.mjs"]);
    runCheck("node", ["tests/verify-assets-media.mjs"]);
    runCheck("node", ["tests/verify-project-canvas-navigation.mjs"]);
  } finally {
    if (server) {
      server.kill("SIGTERM");
      await wait(300);
      if (server.exitCode === null) {
        server.kill("SIGKILL");
      }
    }
  }
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
