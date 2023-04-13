/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { of } from 'rxjs';
import { CoreStart } from '../../../../src/core/public';
import { coreMock } from '../../../../src/core/public/mocks';
import httpClientMock from './httpClientMock';

const coreStart = coreMock.createStart();
coreStart.savedObjects.client.find = jest.fn(() => Promise.resolve({ savedObjects: [] })) as any;

// TODO use coreMock for http
const coreStartMock = ({
  ...coreStart,
  http: httpClientMock,
} as unknown) as CoreStart;

export { coreStartMock };
