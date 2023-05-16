import { DeepPartial } from 'redux';
import {
  ILegacyScopedClusterClient,
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
} from '../../../../../../src/core/server';
import { OpenSearchDashboardsResponseFactory } from '../../../../../../src/core/server/http/router';
import { handleWithCallback } from '../placeholder_router';

jest
  .mock('../../../../../../src/core/server', () => jest.fn())
  .mock('../../../../../../src/core/server/http/router', () => jest.fn());

describe('Data wrapper', () => {
  const clientMock: Partial<ILegacyScopedClusterClient> = {};
  const requestMock: DeepPartial<OpenSearchDashboardsRequest> = {
    url: {
      pathname: '/test',
    },
  };
  const responseMock: DeepPartial<OpenSearchDashboardsResponseFactory> = {
    custom: jest.fn((data) => data),
    ok: jest.fn((data) => data),
  };

  it('retrieves data from the callback method', async () => {
    const callback = jest.fn((_) => {
      return { test: 'data' };
    });
    const result = await handleWithCallback(
      clientMock as ILegacyScopedClusterClient,
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
      clientMock as ILegacyScopedClusterClient,
      responseMock as OpenSearchDashboardsResponseFactory,
      callback
    );

    expect(callback).toHaveBeenCalled();
    expect(responseMock.custom).toHaveBeenCalled();
    expect(result.body).toEqual('test error');
  });
});
