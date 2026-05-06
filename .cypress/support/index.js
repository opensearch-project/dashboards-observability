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
Cypress.on('uncaught:exception', (err) => {
  if (!err || !err.message) return;
  if (err.message.includes('getBoundingClientRect')) return false;
  if (err.message.includes('ResizeObserver loop')) return false;
  // React scheduler occasionally reaches into the Cypress parent frame after
  // a page transition, which the browser rejects as a cross-origin violation.
  // Not a real test failure — the offending render has already been unmounted.
  if (err.message.includes('Blocked a restricted frame')) return false;
});

// Swallow benign async errors at the window level before they reach Cypress's
// uncaught:exception plumbing. In Cypress 13 + Electron, errors thrown from
// microtasks during navigation/teardown sometimes bypass the Cypress.on handler
// entirely, so stopping propagation here is more reliable.
const BENIGN_ERROR_PATTERNS = [
  'getBoundingClientRect',
  'ResizeObserver loop',
  'Blocked a restricted frame',
];
const isBenignError = (message) =>
  typeof message === 'string' && BENIGN_ERROR_PATTERNS.some((p) => message.includes(p));

Cypress.on('window:before:load', (win) => {
  win.addEventListener(
    'error',
    (event) => {
      var errorMessage = event.error && event.error.message;
      if (isBenignError(event.message) || isBenignError(errorMessage)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
  win.addEventListener(
    'unhandledrejection',
    (event) => {
      var reasonMessage = event.reason && event.reason.message;
      if (isBenignError(reasonMessage) || isBenignError(String(event.reason))) {
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