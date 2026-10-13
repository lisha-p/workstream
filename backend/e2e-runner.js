const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const cypressCli = path.join(projectRoot, "node_modules", "cypress", "bin", "cypress");

async function getAvailablePort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => probe.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = probe.address().port;
  await new Promise((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return port;
}

function waitForExit(child) {
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function waitForServer(baseUrl, exitPromise) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const result = await Promise.race([
      fetch(`${baseUrl}/api/health`).then(async response => response.ok && (await response.json()).status === "ok").catch(() => false),
      new Promise(resolve => setTimeout(() => resolve(false), 250))
    ]);
    if (result) return;
    const exit = await Promise.race([exitPromise, new Promise(resolve => setTimeout(() => resolve(null), 0))]);
    if (exit) throw new Error(`App server exited before becoming ready (code ${exit.code ?? exit.signal}).`);
  }
  throw new Error(`App server did not become healthy at ${baseUrl} within 30 seconds.`);
}

async function main() {
  const dataDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "workstream-cypress-"));
  const port = await getAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let server;
  let cypress;
  let serverExit;
  try {
    server = spawn(process.execPath, [path.join(projectRoot, "backend", "server.js")], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PORT: String(port),
        CYPRESS_BASE_URL: baseUrl,
        WORKSTREAM_DB_PATH: path.join(dataDirectory, "workstream.sqlite"),
        WORKSTREAM_LEGACY_FILE: path.join(dataDirectory, "no-legacy-data.json")
      },
      stdio: "inherit"
    });
    serverExit = waitForExit(server);
    await waitForServer(baseUrl, serverExit);

    cypress = spawn(process.execPath, [cypressCli, "run"], {
      cwd: projectRoot,
      env: { ...process.env, CYPRESS_BASE_URL: baseUrl },
      stdio: "inherit"
    });
    const result = await waitForExit(cypress);
    if (result.code !== 0) process.exitCode = result.code || 1;
  } finally {
    if (cypress && cypress.exitCode === null && cypress.signalCode === null) cypress.kill();
    if (server && server.exitCode === null && server.signalCode === null) {
      server.kill();
      if (serverExit) await serverExit;
    }
    await fs.rm(dataDirectory, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
