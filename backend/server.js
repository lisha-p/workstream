const http = require("node:http");
const { mkdirSync } = require("node:fs");
const fs = require("node:fs/promises");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const statuses = new Set(["todo", "in-progress", "done"]);
const priorities = new Set(["urgent", "high", "medium", "low"]);
const assignees = new Set(["JD", "AM", "SK", ""]);
const seedIssues = [
  { id: "WEB-12", title: "Design the new homepage hero section", description: "Explore a clearer headline and a more confident first impression for new visitors.", status: "in-progress", priority: "high", assignee: "AM", due: "2026-10-18" },
  { id: "WEB-13", title: "Create responsive navigation menu", description: "Make the main navigation work beautifully across desktop and mobile.", status: "todo", priority: "medium", assignee: "JD", due: "2026-10-22" },
  { id: "WEB-14", title: "Review and refine brand colors", description: "", status: "done", priority: "low", assignee: "SK", due: "" },
  { id: "WEB-15", title: "Write copy for the services page", description: "Align messaging with the updated brand voice.", status: "todo", priority: "urgent", assignee: "SK", due: "2026-10-17" },
  { id: "WEB-16", title: "Build reusable testimonial component", description: "", status: "in-progress", priority: "medium", assignee: "JD", due: "2026-10-25" },
  { id: "WEB-17", title: "Gather customer quotes and proof points", description: "Collect recent feedback to feature across the new pages.", status: "todo", priority: "low", assignee: "AM", due: "" },
  { id: "WEB-18", title: "Set up new typography scale", description: "", status: "done", priority: "high", assignee: "JD", due: "" }
];
const frontendDirectory = path.join(__dirname, "..", "frontend");
const defaultDatabaseFile = process.env.WORKSTREAM_DB_PATH || path.join(__dirname, "data", "workstream.sqlite");
const legacyDataFile = process.env.WORKSTREAM_LEGACY_FILE || path.join(__dirname, "data", "issues.json");
const staticFiles = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["styles.css", "text/css; charset=utf-8"]]
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(payload));
}

function validateIssue(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "Issue must be a JSON object.";
  if (typeof payload.title !== "string" || !payload.title.trim() || payload.title.trim().length > 120) return "Title is required and must be 120 characters or fewer.";
  if (typeof payload.description !== "string" || payload.description.length > 500) return "Description must be 500 characters or fewer.";
  if (!statuses.has(payload.status)) return "Status is invalid.";
  if (!priorities.has(payload.priority)) return "Priority is invalid.";
  if (!assignees.has(payload.assignee)) return "Assignee is invalid.";
  if (typeof payload.due !== "string" || (payload.due && !/^\d{4}-\d{2}-\d{2}$/.test(payload.due))) return "Due date must use YYYY-MM-DD.";
  return null;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 16_384) throw Object.assign(new Error("Request body is too large."), { statusCode: 413 });
  }
  try {
    return JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { statusCode: 400 });
  }
}

function createAppServer({ databaseFile = defaultDatabaseFile, legacyFile = legacyDataFile } = {}) {
  mkdirSync(path.dirname(databaseFile), { recursive: true });
  const database = new DatabaseSync(databaseFile);
  database.exec(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS issues (
      issue_key TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL CHECK (status IN ('todo', 'in-progress', 'done')),
      priority TEXT NOT NULL CHECK (priority IN ('urgent', 'high', 'medium', 'low')),
      assignee TEXT NOT NULL CHECK (assignee IN ('JD', 'AM', 'SK', '')),
      due TEXT NOT NULL DEFAULT ''
    );
  `);

  const selectIssues = database.prepare(`
    SELECT issue_key AS id, title, description, status, priority, assignee, due
    FROM issues
    ORDER BY CAST(SUBSTR(issue_key, 5) AS INTEGER) DESC
  `);
  const insertIssue = database.prepare(`
    INSERT INTO issues (issue_key, title, description, status, priority, assignee, due)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const updateIssue = database.prepare(`
    UPDATE issues SET title = ?, description = ?, status = ?, priority = ?, assignee = ?, due = ?
    WHERE issue_key = ?
  `);
  const deleteIssue = database.prepare("DELETE FROM issues WHERE issue_key = ?");
  const nextIssueNumber = database.prepare(`
    SELECT COALESCE(MAX(CAST(SUBSTR(issue_key, 5) AS INTEGER)), 11) + 1 AS next
    FROM issues
  `);

  const initialized = database.prepare("SELECT value FROM app_metadata WHERE key = 'issues_initialized'").get();
  if (!initialized) {
    let initialIssues = seedIssues;
    try {
      initialIssues = JSON.parse(require("node:fs").readFileSync(legacyFile, "utf8"));
      if (!Array.isArray(initialIssues)) throw new Error("Legacy issue data must contain an array.");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    database.exec("BEGIN");
    try {
      if (database.prepare("SELECT COUNT(*) AS count FROM issues").get().count === 0) {
        for (const issue of initialIssues) {
          if (!issue || typeof issue.id !== "string" || !/^WEB-\d+$/.test(issue.id) || validateIssue(issue)) {
            throw new Error(`Cannot migrate invalid issue: ${issue?.id || "unknown"}`);
          }
          insertIssue.run(issue.id, issue.title.trim(), issue.description, issue.status, issue.priority, issue.assignee, issue.due);
        }
      }
      database.prepare("INSERT INTO app_metadata (key, value) VALUES ('issues_initialized', 'true')").run();
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (url.pathname === "/api/health" && request.method === "GET") {
        return sendJson(response, 200, { status: "ok" });
      }

      if (url.pathname === "/api/issues" && request.method === "GET") {
        return sendJson(response, 200, selectIssues.all());
      }

      if (url.pathname === "/api/issues" && request.method === "POST") {
        const payload = await readJson(request);
        const validationError = validateIssue(payload);
        if (validationError) return sendJson(response, 400, { error: validationError });
        const issue = {
          id: `WEB-${nextIssueNumber.get().next}`,
          ...payload,
          title: payload.title.trim()
        };
        insertIssue.run(issue.id, issue.title, issue.description, issue.status, issue.priority, issue.assignee, issue.due);
        return sendJson(response, 201, issue);
      }

      const issueMatch = url.pathname.match(/^\/api\/issues\/([^/]+)$/);
      if (issueMatch && request.method === "PUT") {
        const payload = await readJson(request);
        const validationError = validateIssue(payload);
        if (validationError) return sendJson(response, 400, { error: validationError });
        const issueId = decodeURIComponent(issueMatch[1]);
        const issue = {
          id: issueId,
          ...payload,
          title: payload.title.trim()
        };
        const result = updateIssue.run(issue.title, issue.description, issue.status, issue.priority, issue.assignee, issue.due, issueId);
        if (result.changes === 0) return sendJson(response, 404, { error: "Issue not found." });
        return sendJson(response, 200, issue);
      }

      if (issueMatch && request.method === "DELETE") {
        const deleted = deleteIssue.run(decodeURIComponent(issueMatch[1])).changes > 0;
        return deleted ? sendJson(response, 200, { deleted: true }) : sendJson(response, 404, { error: "Issue not found." });
      }

      if (request.method === "GET" && staticFiles.has(url.pathname)) {
        const [fileName, contentType] = staticFiles.get(url.pathname);
        const content = await fs.readFile(path.join(frontendDirectory, fileName));
        response.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-cache" });
        return response.end(content);
      }

      return sendJson(response, 404, { error: "Not found." });
    } catch (error) {
      if (error.statusCode) return sendJson(response, error.statusCode, { error: error.message });
      console.error("Request failed:", error);
      return sendJson(response, 500, { error: "The server could not complete the request." });
    }
  });
  server.on("close", () => database.close());
  return server;
}

if (require.main === module) {
  const port = Number(process.env.PORT || 3000);
  const server = createAppServer();
  server.listen(port, "127.0.0.1", () => {
    console.log(`Workstream is running at http://127.0.0.1:${port}`);
  });
}

module.exports = { createAppServer };
