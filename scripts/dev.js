const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");
const fs = require("node:fs");
const { randomInt } = require("node:crypto");

const root = path.resolve(__dirname, "..");
const backendRoot = path.join(root, "backend");
const frontendRoot = path.join(root, "frontend");

function canListen(port, host) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

async function availablePort(start, host, fallbackStart) {
  if (await canListen(start, host)) return start;
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const candidate = randomInt(fallbackStart, 60000);
    if (await canListen(candidate, host)) return candidate;
  }
  for (let port = start; port <= 65535; port += 1) {
    if (await canListen(port, host)) return port;
  }
  throw new Error(`No available port found starting at ${start}.`);
}

async function waitForBackend(port, isStopping) {
  const deadline = Date.now() + 30000;
  let lastError = "health endpoint did not return status ok";
  while (Date.now() < deadline && !isStopping()) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok && (await response.json()).status === "ok") return;
      lastError = `health endpoint returned HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : "network request failed";
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `Backend did not become healthy at http://127.0.0.1:${port}/api/health: ${lastError}.`,
  );
}

async function main() {
  const legacyPort = process.env.PORT;
  if (legacyPort && !process.env.CURZ_PORT) {
    console.warn("PORT is deprecated; use CURZ_PORT.");
  }
  const backendPort = await availablePort(Number(process.env.CURZ_PORT || legacyPort || 8000), "127.0.0.1", 12000);
  const frontendPort = await availablePort(Number(process.env.VITE_PORT || 5173), "localhost", 42000);
  const python = path.join(backendRoot, ".venv", "Scripts", "python.exe");
  const pythonExecutable = fs.existsSync(python) ? python : "python";
  const env = {
    ...process.env,
    CURZ_HOST: "127.0.0.1",
    CURZ_PORT: String(backendPort),
    VITE_API_PROXY_TARGET: `http://127.0.0.1:${backendPort}`,
  };
  const children = [];
  let shuttingDown = false;

  function shutdown(exitCode) {
    if (shuttingDown) return;
    shuttingDown = true;
    for (const child of children) child.kill();
    setTimeout(() => process.exit(exitCode), 200).unref();
  }

  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));

  function start(name, executable, args, cwd) {
    const child = spawn(executable, args, {
      cwd,
      env,
      stdio: "inherit",
      windowsHide: true,
    });
    children.push(child);
    child.once("error", (error) => {
      console.error(`${name} failed to start: ${error.message}`);
      shutdown(1);
    });
    child.once("exit", (code) => {
      if (!shuttingDown) {
        console.error(`${name} exited with code ${code ?? "unknown"}.`);
        shutdown(code || 1);
      }
    });
    return child;
  }

  console.log(`CurZ backend:  http://127.0.0.1:${backendPort}`);
  start("backend", pythonExecutable, ["-m", "app"], backendRoot);
  try {
    await waitForBackend(backendPort, () => shuttingDown);
  } catch (error) {
    console.error(error.message);
    shutdown(1);
    return;
  }
  console.log(`CurZ frontend: http://localhost:${frontendPort}`);
  start(
    "frontend",
    process.execPath,
    [
      path.join(frontendRoot, "node_modules", "vite", "bin", "vite.js"),
      "--host",
      "localhost",
      "--strictPort",
      "--port",
      String(frontendPort),
    ],
    frontendRoot,
  );
}

main().catch((error) => {
  console.error(`Could not start CurZ: ${error.message}`);
  process.exitCode = 1;
});
