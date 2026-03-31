import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

async function main() {
  const root = process.cwd();

  const [
    loginSource,
    workspaceSource,
    projectsSource,
    assetsSource,
  ] = await Promise.all([
    readFile(path.join(root, "login.html"), "utf8"),
    readFile(path.join(root, "workspace.html"), "utf8"),
    readFile(path.join(root, "projects.html"), "utf8"),
    readFile(path.join(root, "assets.html"), "utf8"),
  ]);

  const checks = [
    {
      ok: loginSource.trimStart().startsWith("<!DOCTYPE html>"),
      message: "login.html must be a standalone HTML document.",
    },
    {
      ok: loginSource.includes('data-page="zm-login"'),
      message: "login.html should expose the login page marker.",
    },
    {
      ok: loginSource.includes('id="loginForm"'),
      message: "login.html should expose the login form hook.",
    },
    {
      ok: loginSource.includes('id="loginUsername"'),
      message: "login.html should expose the username input hook.",
    },
    {
      ok: loginSource.includes('id="loginPassword"'),
      message: "login.html should expose the password input hook.",
    },
    {
      ok: loginSource.includes('class="login-card"'),
      message: "login.html should render a minimal centered login card.",
    },
    {
      ok: !loginSource.includes('class="login-hero"'),
      message: "login.html should remove the large split hero layout.",
    },
    {
      ok: !loginSource.includes('id="loginDemoHint"'),
      message: "login.html should not expose the demo credential hint anymore.",
    },
    {
      ok: !loginSource.includes('id="nextDestination"'),
      message: "login.html should not expose the destination summary card anymore.",
    },
    {
      ok: /<script src="\.\/scripts\/shared\/auth\.js(?:\?v=[^"]+)?"><\/script>/.test(loginSource),
      message: "login.html should load the shared auth runtime.",
    },
    {
      ok: /<script type="module" src="\.\/scripts\/login-page\.js(?:\?v=[^"]+)?"><\/script>/.test(loginSource),
      message: "login.html should load the dedicated login page module.",
    },
    {
      ok: workspaceSource.includes('src="./scripts/shared/auth.js?v=') && workspaceSource.includes('src="./scripts/shared/auth-guard.js?v='),
      message: "workspace.html should load the auth runtime and page guard before the app shell.",
    },
    {
      ok: projectsSource.includes('src="./scripts/shared/auth.js?v=') && projectsSource.includes('src="./scripts/shared/auth-guard.js?v='),
      message: "projects.html should load the auth runtime and page guard before the app shell.",
    },
    {
      ok: assetsSource.includes('src="./scripts/shared/auth.js?v=') && assetsSource.includes('src="./scripts/shared/auth-guard.js?v='),
      message: "assets.html should load the auth runtime and page guard before the app shell.",
    },
    {
      ok: workspaceSource.includes('data-auth-session-label') && workspaceSource.includes('data-auth-logout'),
      message: "workspace.html should expose shared auth session UI hooks.",
    },
    {
      ok: projectsSource.includes('data-auth-session-label') && projectsSource.includes('data-auth-logout'),
      message: "projects.html should expose shared auth session UI hooks.",
    },
    {
      ok: assetsSource.includes('data-auth-session-label') && assetsSource.includes('data-auth-logout'),
      message: "assets.html should expose shared auth session UI hooks.",
    },
  ];

  const failures = checks.filter((check) => !check.ok);

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`FAIL: ${failure.message}`);
    }
    process.exit(1);
  }

  console.log("PASS: login page and protected page auth markers are present.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
