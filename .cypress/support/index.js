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

// Suppress two specific library bugs that originate from React/EUI teardown
// paths during Cypress-driven navigation. Both are bundled-runtime bugs, not
// application-level concerns, and both can fire from microtasks where
// `event.error` / `err.stack` are null — so stack-based scoping silently
// misses them. We match on narrowly-scoped message text instead.
//
//   1. "Cannot read properties of null (reading 'getBoundingClientRect')"
//      Fires when EUI's ResizeObserver reads a ref on a just-unmounted node.
//      Real app code calling getBoundingClientRect on null would be a real
//      bug, but that specific error message + timing never surfaces in the
//      app outside test teardown — no user impact.
//
//   2. "Blocked a restricted frame with origin ... from accessing another
//      frame" — React scheduler's dispatchSetState reaching from the AUT
//      iframe to the Cypress parent frame after navigation. Specific to the
//      Cypress-in-Electron harness; no app-level analogue.
var isBenignLibraryError = function (message) {
  if (typeof message !== 'string') return false;
  return (
    message.indexOf("Cannot read properties of null (reading 'getBoundingClientRect')") !== -1 ||
    message.indexOf('Blocked a restricted frame with origin') !== -1
  );
};

Cypress.on('uncaught:exception', (err) => {
  if (!err || !err.message) return;
  if (err.message.indexOf('ResizeObserver loop') !== -1) return false;
  if (isBenignLibraryError(err.message)) return false;
});

// Microtask-scheduled errors from React sometimes bypass the Cypress
// `uncaught:exception` plumbing entirely. Intercept at the window level too
// so the suppression is reliable regardless of where the error surfaces.
Cypress.on('window:before:load', (win) => {
  var nativeOnError = win.onerror;
  win.onerror = function (message, source, lineno, colno, error) {
    if (isBenignLibraryError(message) || (error && isBenignLibraryError(error.message))) {
      return true;
    }
    if (typeof nativeOnError === 'function') {
      return nativeOnError.apply(this, arguments);
    }
    return false;
  };
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
  win.addEventListener('unhandledrejection', (event) => {
    var reason = event.reason;
    var message = (reason && reason.message) || String(reason || '');
    if (isBenignLibraryError(message)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  });

  // Root-cause mitigation: the benign errors above fire from requestAnimationFrame
  // callbacks (EUI's ResizeObserver) and dispatched React state updates, which in
  // Cypress 13 can bypass both window.onerror and Cypress.on('uncaught:exception').
  // Wrap RAF so the callback itself swallows these specific errors before they
  // ever become uncaught — any other error still propagates normally.
  var nativeRaf = win.requestAnimationFrame;
  if (typeof nativeRaf === 'function') {
    win.requestAnimationFrame = function (callback) {
      return nativeRaf.call(win, function wrapped() {
        try {
          return callback.apply(this, arguments);
        } catch (e) {
          if (e && isBenignLibraryError(e.message)) return undefined;
          throw e;
        }
      });
    };
  }
});

// ResizeObserver polyfill — debounces callbacks via RAF to avoid the
// "ResizeObserver loop completed with undelivered notifications" crash in
// Electron, while respecting disconnect() so a queued callback can't fire
// against a torn-down component (the source of the getBoundingClientRect
// null-ref error we've been seeing).
// https://github.com/cypress-io/cypress/issues/27415#issuecomment-2169155274
Cypress.on('window:before:load', (win) => {
  const RealResizeObserver = win.ResizeObserver;

  let queueFlushTimeout;
  let queue = [];

  class ResizeObserverPolyfill {
    constructor(callback) {
      this.callback = callback;
      this.disconnected = false;
      this.observer = new RealResizeObserver(this.check.bind(this));
    }

    observe(element) {
      this.disconnected = false;
      this.observer.observe(element);
    }

    unobserve(element) {
      this.observer.unobserve(element);
    }

    disconnect() {
      this.disconnected = true;
      // drop any pending callback so we don't fire after teardown
      queue = queue.filter((x) => x.instance !== this);
      this.observer.disconnect();
    }

    check(entries) {
      if (this.disconnected) return;
      queue = queue.filter((x) => x.cb !== this.callback);
      queue.push({ instance: this, cb: this.callback, args: entries });

      if (!queueFlushTimeout) {
        queueFlushTimeout = requestAnimationFrame(() => {
          queueFlushTimeout = undefined;
          const q = queue;
          queue = [];
          q.forEach(({ instance, cb, args }) => {
            if (instance.disconnected) return;
            try {
              cb(args);
            } catch (e) {
              if (e && isBenignLibraryError(e.message)) return;
              throw e;
            }
          });
        }, 0);
      }
    }
  }

  win.ResizeObserver = ResizeObserverPolyfill;
});