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

// Switch the base URL of OpenSearch when security enabled in the cluster
if (Cypress.env('security_enabled')) {
  Cypress.env('opensearch', 'https://localhost:9200');
}

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