import { DeepPartial } from 'redux';
import {
  OpenSearchDashboardsRequest,
  RequestHandlerContext,
} from '../../../../../../src/core/server';
import { OpenSearchDashboardsResponseFactory } from '../../../../../../src/core/server/http/router';
import { wrappedData } from '../placeholder_router';

jest
  .mock('../../../../../../src/core/server', () => jest.fn())
  .mock('../../../../../../src/core/server/http/router', () => jest.fn());

describe('Data wrapper', () => {
  const contextMock: DeepPartial<RequestHandlerContext> = {
    core: {
      opensearch: {
        legacy: {
          client: {},
        },
      },
    },
  };
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
    const result = await wrappedData(
      contextMock as RequestHandlerContext,
      requestMock as OpenSearchDashboardsRequest,
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
    const result = await wrappedData(
      contextMock as RequestHandlerContext,
      requestMock as OpenSearchDashboardsRequest,
      responseMock as OpenSearchDashboardsResponseFactory,
      callback
    );

    expect(callback).toHaveBeenCalled();
    expect(responseMock.custom).toHaveBeenCalled();
    expect(result.body).toEqual('test error');
  });
});
