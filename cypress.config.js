const { defineConfig } = require('cypress');

module.exports = defineConfig({
  video: true,
  chromeWebSecurity: true,
  fixturesFolder: '.cypress/fixtures',
  screenshotsFolder: '.cypress/screenshots',
  videosFolder: '.cypress/videos',
  downloadsFolder: '.cypress/downloads',
  viewportWidth: 2000,
  viewportHeight: 1320,
  requestTimeout: 60000,
  responseTimeout: 60000,
  defaultCommandTimeout: 60000,
  //experimentalNetworkStubbing: true,
  experimentalMemoryManagement: true,
  numTestsKeptInMemory: 0, //Default value 50, chrome crashes without lowering
  env: {
    opensearch: 'localhost:9200',
    opensearchDashboards: 'localhost:5601',
    security_enabled: false,
  },
  'cypress-watch-and-reload': {
    watch: ['common/**', 'public/**', 'server/**'],
  },
  e2e: {
    setupNodeEvents(on, config) {
      return require('./.cypress/plugins/index.js')(on, config);
    },
    baseUrl: 'http://localhost:5601',
    specPattern: '.cypress/integration/**/*.spec.{js,jsx,ts,tsx}',
    supportFile: '.cypress/support/index.js',
    testIsolation: false,
  },
});
