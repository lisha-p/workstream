const statuses = ["todo", "in-progress", "done"];
const priorityLabels = { urgent: "Urgent", high: "High", medium: "Medium", low: "Low" };
const priorityIcons = { urgent: "‼", high: "↑", medium: "↗", low: "↓" };
const assigneeNames = { JD: "Jordan Davis", AM: "Alex Morgan", SK: "Sam Kim", "": "Unassigned" };
const tagByKeyword = [
  ["design", "Design"], ["wireframe", "Design"], ["color", "Design"], ["type", "Design"],
  ["api", "Development"], ["build", "Development"], ["integrat", "Development"], ["code", "Development"],
  ["copy", "Content"], ["content", "Content"], ["write", "Content"],
  ["research", "Research"], ["user interview", "Research"]
];

let issues = [];
let editingId = null;
let showingMyIssues = false;
let toastTimer;
const issueDialog = document.querySelector("#issue-dialog");
const issueForm = document.querySelector("#issue-form");

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
  return body;
}

async function loadIssues() {
  issues = await request("/api/issues");
  render();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function getTag(issue) {
  const text = `${issue.title} ${issue.description}`.toLowerCase();
  const match = tagByKeyword.find(([keyword]) => text.includes(keyword));
  return match ? match[1] : "Design";
}

function getDateLabel(dateString) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function renderIssue(issue) {
  const assigneeClass = issue.assignee ? `assignee-${issue.assignee.toLowerCase()}` : "unassigned";
  const assigneeInitials = issue.assignee || "＋";
  const dueDate = getDateLabel(issue.due);
  const isOverdue = issue.due && new Date(`${issue.due}T23:59:59`) < new Date() && issue.status !== "done";
  return `<article class="issue-card" draggable="true" data-issue-id="${escapeHtml(issue.id)}" tabindex="0" aria-label="${escapeHtml(issue.id)}: ${escapeHtml(issue.title)}">
    <div class="issue-topline"><span class="issue-key">${escapeHtml(issue.id)}</span><button class="issue-menu" type="button" data-edit-issue="${escapeHtml(issue.id)}" aria-label="Edit ${escapeHtml(issue.title)}">···</button></div>
    <h3 class="issue-title">${escapeHtml(issue.title)}</h3>
    ${issue.description ? `<p class="issue-description-preview">${escapeHtml(issue.description)}</p>` : ""}
    <div class="issue-tags"><span class="tag tag-${getTag(issue).toLowerCase()}">${getTag(issue)}</span></div>
    <div class="issue-footer"><div class="issue-meta"><span class="priority priority-${escapeHtml(issue.priority)}"><span class="priority-icon">${priorityIcons[issue.priority] || "↗"}</span>${priorityLabels[issue.priority] || "Medium"}</span>${dueDate ? `<span class="issue-due ${isOverdue ? "overdue" : ""}">◷ ${dueDate}</span>` : ""}</div><span class="card-assignee ${assigneeClass}" title="${escapeHtml(assigneeNames[issue.assignee] || "Unassigned")}">${escapeHtml(assigneeInitials)}</span></div>
  </article>`;
}

function render() {
  const query = document.querySelector("#search-input").value.trim().toLowerCase();
  const priority = document.querySelector("#priority-filter").value;
  for (const status of statuses) {
    const columnIssues = issues.filter(issue => issue.status === status);
    const filteredIssues = columnIssues.filter(issue => {
      const matchesQuery = !query || `${issue.id} ${issue.title} ${issue.description}`.toLowerCase().includes(query);
      return matchesQuery && (!showingMyIssues || issue.assignee === "JD") && (priority === "all" || issue.priority === priority);
    });
    document.querySelector(`[data-list="${status}"]`).innerHTML = filteredIssues.map(renderIssue).join("");
    document.querySelector(`[data-count="${status}"]`).textContent = String(columnIssues.length);
  }
  const complete = issues.filter(issue => issue.status === "done").length;
  const inProgress = issues.filter(issue => issue.status === "in-progress").length;
  document.querySelector("#total-stat").textContent = String(issues.length);
  document.querySelector("#progress-stat").textContent = String(inProgress);
  document.querySelector("#done-stat").textContent = `${issues.length ? Math.round(complete / issues.length * 100) : 0}%`;
  document.querySelector("#my-issues-count").textContent = String(issues.filter(issue => issue.assignee === "JD").length);
  bindCardEvents();
}

function openIssueDialog(issue = null, status = "todo") {
  editingId = issue?.id || null;
  document.querySelector("#dialog-eyebrow").textContent = issue ? `EDIT ISSUE · ${issue.id}` : "NEW ISSUE";
  document.querySelector("#dialog-title").textContent = issue ? "Edit issue" : "Create an issue";
  document.querySelector("#issue-title").value = issue?.title || "";
  document.querySelector("#issue-description").value = issue?.description || "";
  document.querySelector("#issue-status").value = issue?.status || status;
  document.querySelector("#issue-priority").value = issue?.priority || "medium";
  document.querySelector("#issue-assignee").value = issue?.assignee ?? "JD";
  document.querySelector("#issue-due").value = issue?.due || "";
  document.querySelector("#delete-issue").hidden = !issue;
  issueForm.querySelector('[type="submit"]').textContent = issue ? "Save changes" : "Create issue";
  issueDialog.showModal();
  requestAnimationFrame(() => document.querySelector("#issue-title").focus());
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2500);
}

function bindCardEvents() {
  document.querySelectorAll(".issue-card").forEach(card => {
    card.addEventListener("dragstart", event => {
      event.dataTransfer.setData("text/plain", card.dataset.issueId);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    });
    card.addEventListener("dragend", () => card.classList.remove("dragging"));
    card.addEventListener("dblclick", () => {
      const issue = issues.find(item => item.id === card.dataset.issueId);
      if (issue) openIssueDialog(issue);
    });
    card.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const issue = issues.find(item => item.id === card.dataset.issueId);
        if (issue) openIssueDialog(issue);
      }
    });
  });
  document.querySelectorAll("[data-edit-issue]").forEach(button => {
    button.addEventListener("click", event => {
      event.stopPropagation();
      const issue = issues.find(item => item.id === button.dataset.editIssue);
      if (issue) openIssueDialog(issue);
    });
  });
}

document.querySelector("#create-issue-top").addEventListener("click", () => openIssueDialog());
document.querySelectorAll("[data-add-status]").forEach(button => button.addEventListener("click", () => openIssueDialog(null, button.dataset.addStatus)));
document.querySelector("#search-input").addEventListener("input", render);
document.querySelector("#priority-filter").addEventListener("change", render);
document.querySelector(".dialog-close").addEventListener("click", () => issueDialog.close());
document.querySelector(".cancel-button").addEventListener("click", () => issueDialog.close());
issueDialog.addEventListener("click", event => {
  if (event.target === issueDialog) issueDialog.close();
});

issueForm.addEventListener("submit", async event => {
  event.preventDefault();
  const formData = new FormData(issueForm);
  const values = {
    title: String(formData.get("title")).trim(),
    description: String(formData.get("description")).trim(),
    status: String(formData.get("status")),
    priority: String(formData.get("priority")),
    assignee: String(formData.get("assignee")),
    due: String(formData.get("due"))
  };
  if (!values.title || !statuses.includes(values.status) || !Object.hasOwn(priorityLabels, values.priority)) return;
  try {
    const savedIssue = editingId
      ? await request(`/api/issues/${encodeURIComponent(editingId)}`, { method: "PUT", body: JSON.stringify(values) })
      : await request("/api/issues", { method: "POST", body: JSON.stringify(values) });
    if (editingId) {
      issues = issues.map(issue => issue.id === editingId ? savedIssue : issue);
      showToast("Issue updated");
    } else {
      issues.unshift(savedIssue);
      showToast("Issue created");
    }
    render();
    issueDialog.close();
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#delete-issue").addEventListener("click", async () => {
  if (!editingId) return;
  try {
    await request(`/api/issues/${encodeURIComponent(editingId)}`, { method: "DELETE" });
    issues = issues.filter(issue => issue.id !== editingId);
    render();
    issueDialog.close();
    showToast("Issue deleted");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelectorAll(".board-column").forEach(column => {
  column.addEventListener("dragover", event => {
    event.preventDefault();
    column.classList.add("drag-over");
  });
  column.addEventListener("dragleave", event => {
    if (!column.contains(event.relatedTarget)) column.classList.remove("drag-over");
  });
  column.addEventListener("drop", async event => {
    event.preventDefault();
    column.classList.remove("drag-over");
    const issueId = event.dataTransfer.getData("text/plain");
    const issue = issues.find(item => item.id === issueId);
    if (!issue || !statuses.includes(column.dataset.status) || issue.status === column.dataset.status) return;
    const previousStatus = issue.status;
    issue.status = column.dataset.status;
    try {
      const updatedIssue = await request(`/api/issues/${encodeURIComponent(issueId)}`, {
        method: "PUT",
        body: JSON.stringify({ ...issue, status: column.dataset.status })
      });
      issues = issues.map(item => item.id === issueId ? updatedIssue : item);
      render();
      showToast("Issue moved");
    } catch (error) {
      issue.status = previousStatus;
      render();
      showToast(error.message);
    }
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName) && !issueDialog.open) {
    event.preventDefault();
    document.querySelector("#search-input").focus();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    document.querySelector("#search-input").focus();
  }
});

["#invite-button", "#invite-small", "#share-button", "#add-project-button", "#filter-button", "#sprint-button", ".toolbar-menu", ".crumb-menu", ".title-caret", "#more-members"].forEach(selector => {
  document.querySelector(selector)?.addEventListener("click", () => showToast("This workspace action is coming soon."));
});
document.querySelectorAll(".view-tab:not(.active)").forEach(button => button.addEventListener("click", () => showToast("List view is coming soon.")));
document.querySelectorAll(".project-link:not(.selected)").forEach(button => button.addEventListener("click", () => showToast("This project is coming soon.")));
document.querySelector(".workspace-switcher").addEventListener("click", () => showToast("Workspace switching is coming soon."));
document.querySelector(".nav-group").addEventListener("click", event => {
  if (event.target.closest(".nav-item")?.textContent.includes("Home")) showToast("Your home dashboard is coming soon.");
  if (event.target.closest(".nav-item")?.textContent.includes("My issues")) {
    showingMyIssues = !showingMyIssues;
    event.target.closest(".nav-item").classList.toggle("my-issues-active", showingMyIssues);
    render();
    showToast(showingMyIssues ? "Showing issues assigned to you" : "Showing all project issues");
  }
});

loadIssues().catch(error => {
  console.error("Unable to load issues.", error);
  showToast(`Unable to load issues: ${error.message}`);
});
