const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createAppServer } = require("./server");

async function startServer(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

async function stopServer(server) {
  if (server?.listening) {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test("issue API CRUD persists in SQLite across backend restarts", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "workstream-test-"));
  const databaseFile = path.join(directory, "issues.sqlite");
  let server = createAppServer({ databaseFile, legacyFile: path.join(directory, "missing.json") });
  let baseUrl = await startServer(server);
  t.after(async () => {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  });

  const initialResponse = await fetch(`${baseUrl}/api/issues`);
  const initialIssues = await initialResponse.json();
  assert.equal(initialResponse.status, 200);
  assert.equal(initialIssues.length, 7);

  const issueInput = {
    title: "API-created issue",
    description: "Stored in SQLite",
    status: "todo",
    priority: "high",
    assignee: "JD",
    due: ""
  };
  const createResponse = await fetch(`${baseUrl}/api/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(issueInput)
  });
  const createdIssue = await createResponse.json();
  assert.equal(createResponse.status, 201);
  assert.equal(createdIssue.id, "WEB-19");

  const updateResponse = await fetch(`${baseUrl}/api/issues/${createdIssue.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...issueInput, status: "done" })
  });
  assert.equal(updateResponse.status, 200);
  assert.equal((await updateResponse.json()).status, "done");

  const missingUpdateResponse = await fetch(`${baseUrl}/api/issues/WEB-404`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(issueInput)
  });
  assert.equal(missingUpdateResponse.status, 404);

  const missingDeleteResponse = await fetch(`${baseUrl}/api/issues/WEB-404`, { method: "DELETE" });
  assert.equal(missingDeleteResponse.status, 404);

  const invalidResponse = await fetch(`${baseUrl}/api/issues`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...issueInput, priority: "immediate" })
  });
  assert.equal(invalidResponse.status, 400);

  await stopServer(server);
  server = createAppServer({ databaseFile, legacyFile: path.join(directory, "missing.json") });
  baseUrl = await startServer(server);
  const persistedIssues = await (await fetch(`${baseUrl}/api/issues`)).json();
  assert.equal(persistedIssues.find(issue => issue.id === createdIssue.id).status, "done");

  const deleteResponse = await fetch(`${baseUrl}/api/issues/${createdIssue.id}`, { method: "DELETE" });
  assert.equal(deleteResponse.status, 200);
  const finalResponse = await fetch(`${baseUrl}/api/issues`);
  assert.equal((await finalResponse.json()).length, 7);
  assert.equal((await fs.stat(databaseFile)).isFile(), true);

  await stopServer(server);
  server = createAppServer({ databaseFile, legacyFile: path.join(directory, "missing.json") });
  baseUrl = await startServer(server);
  assert.equal((await (await fetch(`${baseUrl}/api/issues`)).json()).length, 7);
});

test("server serves the frontend and health endpoint", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "workstream-test-"));
  const server = createAppServer({ databaseFile: path.join(directory, "issues.sqlite"), legacyFile: path.join(directory, "missing.json") });
  const baseUrl = await startServer(server);
  t.after(async () => {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  });

  const page = await fetch(baseUrl);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Website redesign/);
  const health = await fetch(`${baseUrl}/api/health`);
  assert.deepEqual(await health.json(), { status: "ok" });
});

test("existing JSON issue data is migrated to SQLite", async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "workstream-test-"));
  const databaseFile = path.join(directory, "issues.sqlite");
  const legacyFile = path.join(directory, "issues.json");
  await fs.writeFile(legacyFile, JSON.stringify([{
    id: "WEB-42",
    title: "Existing issue",
    description: "",
    status: "todo",
    priority: "low",
    assignee: "",
    due: ""
  }]));
  const server = createAppServer({ databaseFile, legacyFile });
  const baseUrl = await startServer(server);
  t.after(async () => {
    await stopServer(server);
    await fs.rm(directory, { recursive: true, force: true });
  });

  const issues = await (await fetch(`${baseUrl}/api/issues`)).json();
  assert.equal(issues.length, 1);
  assert.equal(issues[0].id, "WEB-42");
  assert.equal(issues[0].title, "Existing issue");
});
