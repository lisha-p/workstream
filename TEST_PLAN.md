# Workstream test plan

## Scope and execution

Run the backend/API checks with `npm test`, the browser checks with `npm run test:frontend`, or both with `npm run test:all`. The Cypress runner starts the real Node server against an isolated temporary SQLite database, waits for its health endpoint, launches the browser tests, then stops the server and removes the temporary database. Cypress CRUD tests also remove their uniquely named issues.

## Backend and API

- `GET /api/health` reports that the service is running.
- `GET /api/issues` returns the starter issues and serves a working frontend.
- `POST /api/issues` creates an issue with a generated key; invalid fields are rejected.
- `PUT /api/issues/:id` updates issue fields and status; unknown issues return not found.
- `DELETE /api/issues/:id` removes the issue; unknown issues return not found.
- SQLite CRUD data survives closing and reopening the server.
- Existing JSON issue data is imported into a newly initialized SQLite database.

These checks are implemented with Node's built-in JavaScript test runner in `backend/server.test.js`.

## Frontend and integration

- The project board loads real issues from the backend.
- Search and priority controls filter visible cards.
- The “My issues” navigation filters to the current assignee.
- The issue form creates records through the API and displays the returned issue key.
- Editing a card sends an update, changes its status, and remains visible after a browser reload.
- Deleting a card removes it from both the board and the backend.

These end-to-end checks are implemented in JavaScript with Cypress in `cypress/e2e/workstream.cy.js`.

## Future manual checks

- Check board layout and issue dialogs at narrow mobile, tablet, and desktop viewport widths.
- Exercise keyboard-only navigation, drag-and-drop between every status, and assistive-technology labels.
- Test persistence with the deployment's chosen database backup/restore and concurrent-user setup.
