/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { OpenSearchDashboardsResponseFactory } from '../../../../../../src/core/server/http/router';
import { handleWithCallback } from '../integrations_router';
import { IntegrationsAdaptor } from 'server/adaptors/integrations/integrations_adaptor';

describe('handleWithCallback', () => {
  let adaptorMock: jest.Mocked<IntegrationsAdaptor>;
  let responseMock: jest.Mocked<OpenSearchDashboardsResponseFactory>;

  beforeEach(() => {
    adaptorMock = {} as any;
    responseMock = {
      custom: jest.fn((data) => data),
      ok: jest.fn((data) => data),
    } as any;
  });

  it('retrieves data from the callback method', async () => {
    const callback = jest.fn((_) => {
      return { test: 'data' };
    });

    const result = await handleWithCallback(
      adaptorMock as IntegrationsAdaptor,
      responseMock as OpenSearchDashboardsResponseFactory,
      callback
    );

    expect(callback).toHaveBeenCalled();
    expect(responseMock.ok).toHaveBeenCalled();
    expect(result.body.data).toEqual({ test: 'data' });
  });

  it('passes callback errors through', async () => {
    const callback = jest.fn((_) => {
      throw new Error('test error');
    });

    const result = await handleWithCallback(
      adaptorMock as IntegrationsAdaptor,
      responseMock as OpenSearchDashboardsResponseFactory,
      callback
    );

    expect(callback).toHaveBeenCalled();
    expect(responseMock.custom).toHaveBeenCalled();
    expect(result.body).toEqual('test error');
  });
});
