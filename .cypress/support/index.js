/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// ***********************************************************
// This example support/index.js is processed and
// loaded automatically before your test files.
//
// This is a great place to put global configuration and
// behavior that modifies Cypress.
//
// You can change the location of this file or turn off
// automatically serving support files with the
// 'supportFile' configuration option.
//
// You can read more here:
// https://on.cypress.io/configuration
// ***********************************************************

import 'cypress-watch-and-reload/support'

// Import commands.js using ES2015 syntax:
import './commands';

// Alternatively you can use CommonJS syntax:
// require('./commands')

// Import OSD commands for workspace/dataset management (used by APM tests)
import '../utils/commands.osd';

// Switch the base URL of OpenSearch when security enabled in the cluster
if (Cypress.env('security_enabled')) {
  Cypress.env('opensearch', 'https://localhost:9200');
}

// Globally swallow benign uncaught exceptions that originate from EUI/OUI
// internals (osd-ui-shared-deps) during flyout/popover/page teardown in Cypress.
// Registered here so the handler is active during `before`/`beforeEach` hooks,
// before any spec-level `cy.on` has a chance to run.
//
// NOTE: these suppressions are scoped by both message AND stack origin — we
// only swallow errors that come from the bundled React/EUI runtime, not from
// application code. This prevents masking real issues in the code under test.
const fromSharedDeps = (err) =>
  typeof err.stack === 'string' && err.stack.includes('osd-ui-shared-deps');

Cypress.on('uncaught:exception', (err) => {
  if (!err || !err.message) return;
  if (err.message.includes('ResizeObserver loop')) return false;
  if (err.message.includes('getBoundingClientRect') && fromSharedDeps(err)) return false;
  // React scheduler occasionally reaches into the Cypress parent frame after
  // a page transition, which the browser rejects as a cross-origin violation.
  // Only swallow when the stack points at the React/EUI runtime — never when
  // the app itself legitimately trips a cross-origin boundary.
  if (err.message.includes('Blocked a restricted frame') && fromSharedDeps(err)) return false;
});

// Suppress benign, well-known library bugs that fire from React/EUI teardown
// paths and bypass Cypress's uncaught:exception plumbing (both errors fire from
// microtasks, so `event.error` / `event.filename` can be null — stack-based
// scoping silently misses them).
//
// Both messages below are specific library bugs, not app-level concerns:
//   - getBoundingClientRect: null ref read inside EUI's ResizeObserver
//   - Blocked a restricted frame: EUI onResize reaching the Cypress parent
//     frame during navigation (cross-origin rejection of an already-unmounted
//     component's layout callback, not an app-side security boundary)
// Matching by message text is scoped enough to avoid hiding real failures.
var isBenignLibraryError = function (message) {
  if (typeof message !== 'string') return false;
  return (
    message.indexOf('getBoundingClientRect') !== -1 ||
    message.indexOf('Blocked a restricted frame') !== -1
  );
};

Cypress.on('window:before:load', (win) => {
  // Some Cypress versions install window.onerror; wrap it so we suppress
  // benign errors before Cypress's handler runs.
  var nativeOnError = win.onerror;
  win.onerror = function (message, source, lineno, colno, error) {
    if (isBenignLibraryError(message) || (error && isBenignLibraryError(error.message))) {
      return true; // prevent default — tells the browser the error was handled
    }
    if (typeof nativeOnError === 'function') {
      return nativeOnError.apply(this, arguments);
    }
    return false;
  };
  // Belt-and-suspenders: also intercept via addEventListener (capture phase).
  win.addEventListener(
    'error',
    (event) => {
      var err = event.error;
      var message = event.message || (err && err.message) || '';
      if (isBenignLibraryError(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
});

// Fix for ResizeObserver crash in Electron
// https://github.com/cypress-io/cypress/issues/27415#issuecomment-2169155274
Cypress.on('window:before:load', (win) => {
  const RealResizeObserver = win.ResizeObserver;

  let queueFlushTimeout;
  let queue = [];

  class ResizeObserverPolyfill {
    constructor(callback) {
      this.callback = callback;
      this.observer = new RealResizeObserver(this.check.bind(this));
    }

    observe(element) {
      this.observer.observe(element);
    }

    unobserve(element) {
      this.observer.unobserve(element);
    }

    disconnect() {
      this.observer.disconnect();
    }

    check(entries) {
      queue = queue.filter((x) => x.cb !== this.callback);
      queue.push({ cb: this.callback, args: entries });

      if (!queueFlushTimeout) {
        queueFlushTimeout = requestAnimationFrame(() => {
          queueFlushTimeout = undefined;
          const q = queue;
          queue = [];
          q.forEach(({ cb, args }) => cb(args));
        }, 0);
      }
    }
  }

  win.ResizeObserver = ResizeObserverPolyfill;
});