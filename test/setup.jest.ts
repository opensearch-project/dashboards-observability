/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

// import '@testing-library/jest-dom/extend-expect';
import { configure } from '@testing-library/react';
import { setOSDHttp, setOSDSavedObjectsClient } from '../common/utils';
import { coreRefs } from '../public/framework/core_refs';
import { coreStartMock } from './__mocks__/coreMocks';

configure({ testIdAttribute: 'data-test-subj' });

window.URL.createObjectURL = () => '';
HTMLCanvasElement.prototype.getContext = () => '' as any;
window.IntersectionObserver = class IntersectionObserver {
  constructor() {}

  disconnect() {
    return null;
  }

  observe() {
    return null;
  }

  takeRecords() {
    return null;
  }

  unobserve() {
    return null;
  }
} as any;

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
