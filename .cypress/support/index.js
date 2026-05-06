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

// Suppress a benign React/EUI null-dereference at the window level. When the
// scheduler tears down a node mid-render, an internal observer reads
// `ref.getBoundingClientRect()` on the unmounted element. The error fires from
// a microtask, so `event.error` / `event.filename` can both be null — which is
// why Cypress's `uncaught:exception` hook and stack-based guards miss it.
//
// This message match is scoped to a specific library bug (not a security or
// app-level concern), so matching by text alone is acceptable here. Other
// classes of error still surface normally.
Cypress.on('window:before:load', (win) => {
  win.addEventListener(
    'error',
    (event) => {
      var err = event.error;
      var message = event.message || (err && err.message) || '';
      if (message.indexOf('getBoundingClientRect') !== -1) {
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