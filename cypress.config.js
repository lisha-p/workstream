const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.CYPRESS_BASE_URL || "http://127.0.0.1:3107",
    specPattern: "cypress/e2e/**/*.cy.js",
    supportFile: false,
    video: false,
    defaultCommandTimeout: 8000
  }
});
