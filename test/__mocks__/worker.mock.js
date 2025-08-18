/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

if (!global.Worker) {
  // eslint-disable-next-line
  global.Worker = class MockWorker {
    constructor() {}

    postMessage() {
      // Mock implementation
      if (this.onmessage) {
        this.onmessage();
      }
    }

    terminate() {
      // Mock implementation
    }

    addEventListener() {}

    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
    onerror() {}
    onmessage() {}
    onmessageerror() {}
  };
}
