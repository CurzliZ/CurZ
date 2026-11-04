import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = mkdtempSync(join(tmpdir(), "curz-e2e-"));
const home = join(root, "home");
const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = join(frontend, "node_modules", "playwright", "cli.js");
const env = {
  ...process.env,
  CURZ_DATABASE_URL: `sqlite:///${join(root, "curz.db").replaceAll("\\", "/")}`,
  HOME: home,
  USERPROFILE: home,
  CURZ_E2E_ROOT: root,
};

const runner = spawn(process.execPath, [playwrightCli, "test"], {
  cwd: frontend,
  env,
  stdio: "inherit",
  windowsHide: true,
});

runner.once("error", (error) => {
  rmSync(root, { recursive: true, force: true });
  console.error(`Playwright could not start: ${error.message}`);
  process.exitCode = 1;
});

runner.once("close", (code) => {
  try {
    rmSync(root, { recursive: true, force: true });
  } catch (error) {
    console.error(`Could not clean the isolated e2e workspace: ${error.message}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
