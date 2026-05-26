module.exports = {
  root: true,
  extends: ['plugin:cypress/recommended'],
  env: {
    'cypress/globals': true,
  },
  plugins: ['cypress'],
  rules: {
    // Add cypress specific rules here
    'cypress/no-assigning-return-values': 'error',
    // The `cypress/no-unnecessary-waiting` rule in our pinned eslint-plugin-cypress
    // throws `Cannot read properties of undefined (reading 'null')` on any
    // `cy.wait(variable)` call, aborting ESLint before it can report anything
    // or be silenced by an inline disable comment. Disable scope-wide until the
    // plugin is upgraded (tracked by: no open issue yet).
    'cypress/no-unnecessary-waiting': 'off',
    'cypress/assertion-before-screenshot': 'warn',
    'cypress/no-force': 'warn',
    'cypress/no-async-tests': 'error',
  },
};
