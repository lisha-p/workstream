# Workstream

Workstream is a lightweight Jira-style project board with a browser frontend and a Node.js backend.

## Run locally

Requires Node.js 22.13 or later. The backend uses Node's built-in SQLite module, so no database server or additional package installation is needed. Start the app from the repository root:

```sh
npm start
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). The backend serves the frontend and stores issues in the SQLite database `backend/data/workstream.sqlite` (created on first run). Existing data in `backend/data/issues.json` is imported automatically the first time the SQLite database is initialized. Set `PORT` to use a different port.

## Included

- `frontend/`: responsive Kanban interface and API client
- `backend/`: Node.js HTTP server, validated issue API, and SQLite persistence
- Kanban board with To do, In progress, and Done columns
- Create, edit, delete, and drag issues between statuses
- Search by issue key, title, or description; filter by priority
- Priority, assignee, description, and due-date fields
- Project totals, in-progress count, and completion percentage
- Responsive layout and keyboard shortcuts (`/` to search, `⌘K`/`Ctrl+K` to focus search)

The starter board is seeded with example website-redesign issues. Sharing, multiple projects, and the list view are visual placeholders. SQLite is suitable for this single-server MVP; authentication and multi-user hosting are not included.

Install the development test tools with `npm install`. Run the backend API tests with `npm test`, Cypress browser tests with `npm run test:frontend`, or both with `npm run test:all`. See [TEST_PLAN.md](TEST_PLAN.md) for test coverage and future manual checks.
