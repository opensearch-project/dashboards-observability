/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DeepPartial } from 'redux';
import { OpenSearchDashboardsResponseFactory } from '../../../../../../src/core/server/http/router';
import { handleWithCallback } from '../integrations_router';
import { IntegrationsAdaptor } from 'server/adaptors/integrations/integrations_adaptor';

jest
  .mock('../../../../../../src/core/server', () => jest.fn())
  .mock('../../../../../../src/core/server/http/router', () => jest.fn());

describe('Data wrapper', () => {
  const adaptorMock: Partial<IntegrationsAdaptor> = {};
  const responseMock: DeepPartial<OpenSearchDashboardsResponseFactory> = {
    custom: jest.fn((data) => data),
    ok: jest.fn((data) => data),
  };

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
