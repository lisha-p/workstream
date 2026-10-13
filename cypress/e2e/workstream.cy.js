describe("Workstream project board", () => {
  beforeEach(() => {
    cy.intercept("GET", "/api/issues").as("loadIssues");
    cy.visit("/");
    cy.wait("@loadIssues").its("response.statusCode").should("eq", 200);
  });

  afterEach(() => {
    cy.request("/api/issues").then(({ body }) => {
      body.filter(issue => issue.title.startsWith("E2E Cypress issue ")).forEach(issue => {
        cy.request({ method: "DELETE", url: `/api/issues/${issue.id}` });
      });
    });
  });

  it("loads API-backed issues and filters the board by search and priority", () => {
    cy.get("#total-stat").should("not.have.text", "0");
    cy.get('[data-list="todo"] .issue-card').should("have.length.greaterThan", 0);
    cy.get("#search-input").type("WEB-13");
    cy.get(".issue-card").should("have.length", 1).and("contain.text", "Create responsive navigation menu");
    cy.get("#search-input").clear();
    cy.get("#priority-filter").select("urgent");
    cy.get(".issue-card").should("have.length.greaterThan", 0);
    cy.get(".issue-card").each(card => cy.wrap(card).find(".priority").should("contain.text", "Urgent"));
  });

  it("creates, edits, reloads, and deletes an issue through the backend API", () => {
    const title = `E2E Cypress issue ${Date.now()}`;
    cy.intercept("POST", "/api/issues").as("createIssue");
    cy.get("#create-issue-top").click();
    cy.get("#issue-title").type(title);
    cy.get("#issue-description").type("Created from the Cypress frontend test.");
    cy.get("#issue-priority").select("high");
    cy.get("#issue-assignee").select("AM");
    cy.get("#issue-form").submit();

    cy.wait("@createIssue").then(({ response }) => {
      expect(response.statusCode).to.eq(201);
      const issueId = response.body.id;
      cy.contains(".issue-card", title).should("be.visible").and("contain.text", "High");

      cy.intercept("PUT", `/api/issues/${issueId}`).as("updateIssue");
      cy.contains(".issue-card", title).find(".issue-menu").click();
      cy.get("#issue-title").clear().type(`${title} updated`);
      cy.get("#issue-status").select("done");
      cy.get("#issue-form").submit();
      cy.wait("@updateIssue").its("response.body.status").should("eq", "done");
      cy.get('[data-list="done"]').should("contain.text", `${title} updated`);

      cy.reload();
      cy.wait("@loadIssues");
      cy.get('[data-list="done"]').should("contain.text", `${title} updated`);
      cy.request("/api/issues").then(({ body }) => {
        const persistedIssue = body.find(issue => issue.id === issueId);
        expect(persistedIssue?.title).to.eq(`${title} updated`);
      });

      cy.intercept("DELETE", `/api/issues/${issueId}`).as("deleteIssue");
      cy.contains(".issue-card", `${title} updated`).find(".issue-menu").click();
      cy.get("#delete-issue").click();
      cy.wait("@deleteIssue").its("response.statusCode").should("eq", 200);
      cy.contains(".issue-card", `${title} updated`).should("not.exist");
      cy.request("/api/issues").then(({ body }) => {
        expect(body.some(issue => issue.id === issueId)).to.eq(false);
      });
    });
  });

  it("filters the project board to issues assigned to the current user", () => {
    cy.get("#total-stat").should("not.have.text", "0");
    cy.get("#my-issues-count").should("not.have.text", "0");
    cy.get("#total-stat").invoke("text").then(total => {
      cy.get("#my-issues-count").invoke("text").then(myCount => {
        const allIssueCount = Number.parseInt(total, 10);
        const expected = Number.parseInt(myCount, 10);
        cy.contains(".nav-item", "My issues").click();
        cy.get(".issue-card").should("have.length", expected);
        expect(expected).to.be.at.most(allIssueCount);
      });
    });
  });
});
