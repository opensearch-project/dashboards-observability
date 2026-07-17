/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import '@testing-library/jest-dom';

import './__mocks__/worker.mock';
import { configure } from '@testing-library/react';
import { setOSDHttp, setOSDSavedObjectsClient } from '../common/utils';
import { coreRefs } from '../public/framework/core_refs';

import { coreStartMock } from './__mocks__/coreMocks';

configure({ testIdAttribute: 'data-test-subj' });

window.URL.createObjectURL = () => '';
HTMLCanvasElement.prototype.getContext = () => '' as unknown as RenderingContext;
window.IntersectionObserver = jest.fn().mockImplementation(() => ({
  disconnect: () => null,
  observe: () => null,
  takeRecords: () => null,
  unobserve: () => null,
})) as unknown as typeof IntersectionObserver;

window.ResizeObserver = jest.fn().mockImplementation(() => ({
  disconnect: () => null,
  observe: () => null,
  unobserve: () => null,
})) as unknown as typeof ResizeObserver;

jest.mock('@elastic/eui/lib/components/form/form_row/make_id', () => () => 'random-id');

jest.mock('@elastic/eui/lib/services/accessibility/html_id_generator', () => ({
  htmlIdGenerator: () => {
    return () => 'random_html_id';
  },
}));

jest.setTimeout(30000);

setOSDHttp(coreStartMock.http);
setOSDSavedObjectsClient(coreStartMock.savedObjects.client);
coreRefs.http = coreStartMock.http;
coreRefs.savedObjectsClient = coreStartMock.savedObjects.client;
coreRefs.toasts = coreStartMock.notifications.toasts;
coreRefs.chrome = coreStartMock.chrome;

// jest-location-mock uses process.env.HOST as the base URL for its window.location mock.
// Set it to match testEnvironmentOptions.url so window.location.origin is 'http://localhost:5601'
// in all jsdom tests, consistent with the rest of the suite.
process.env.HOST = 'http://localhost:5601';

// Mock window.matchMedia for Monaco editor
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // Deprecated
    removeListener: jest.fn(), // Deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// jsdom 26 marks window.localStorage and window.sessionStorage as non-configurable.
// Re-declare them as configurable once here so individual tests can override them
// with Object.defineProperty without hitting "Cannot redefine property" errors.
['localStorage', 'sessionStorage'].forEach((key) => {
  const descriptor = Object.getOwnPropertyDescriptor(window, key);
  if (descriptor && !descriptor.configurable) {
    Object.defineProperty(window, key, {
      configurable: true,
      writable: true,
      value: descriptor.value,
    });
  }
});
