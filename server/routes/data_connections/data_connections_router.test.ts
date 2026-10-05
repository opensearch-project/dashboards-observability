/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { IRouter } from '../../../../../src/core/server';
import {
  httpServerMock,
  httpServiceMock,
  loggingSystemMock,
} from '../../../../../src/core/server/mocks';
import { logDataConnectionError, registerDataConnectionsRoute } from './data_connections_router';

describe('data_connections_router', () => {
  let router: jest.Mocked<IRouter>;
  let mockContext: any;
  let mockRequest: any;
  let mockResponse: any;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    router = httpServiceMock.createRouter();
    logger = loggingSystemMock.createLogger();
    mockContext = {
      dataSource: {
        opensearch: {
          legacy: {
            getClient: jest.fn().mockReturnValue({ callAPI: jest.fn() }),
          },
        },
      },
      observability_plugin: {
        observabilityClient: {
          asScoped: jest.fn().mockReturnValue({ callAsCurrentUser: jest.fn() }),
        },
      },
    };
    mockResponse = httpServerMock.createResponseFactory();
  });

  // Shape of the StatusCodeError thrown by the legacy elasticsearch client when the security
  // plugin rejects `GET /_plugins/_query/_datasources` for a user without permission.
  const authorizationError = Object.assign(new Error('Authorization Exception'), {
    statusCode: 403,
    displayName: 'AuthorizationException',
    path: '/_plugins/_query/_datasources',
    body: {
      status: 403,
      error: {
        type: 'OpenSearchSecurityException',
        reason: 'There was internal problem at backend',
        details:
          'no permissions for [cluster:admin/opensearch/ql/datasources/read] and User [name=test-user, backend_roles=[read-only]]',
      },
    },
    response: '{"status":403}',
  });

  describe('logDataConnectionError', () => {
    it.each([401, 403, 404])('logs %i errors at debug level', (statusCode) => {
      logDataConnectionError(logger, 'Issue in fetching data sources', {
        statusCode,
        message: 'expected failure',
      });

      expect(logger.debug).toHaveBeenCalledWith(
        `Issue in fetching data sources [${statusCode}]: expected failure`
      );
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs unexpected errors at error level', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', {
        statusCode: 500,
        message: 'Internal Server Error',
      });

      expect(logger.error).toHaveBeenCalledWith(
        'Issue in fetching data sources [500]: Internal Server Error'
      );
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it('falls back to body.statusCode', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', {
        body: { statusCode: 403 },
        message: 'Forbidden',
      });

      expect(logger.debug).toHaveBeenCalledWith('Issue in fetching data sources [403]: Forbidden');
      expect(logger.error).not.toHaveBeenCalled();
    });

    it('logs errors without a status code at error level', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', new Error('socket hang up'));

      expect(logger.error).toHaveBeenCalledWith(
        'Issue in fetching data sources [unknown]: socket hang up'
      );
    });

    it('logs a single-line summary instead of the full error object', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', authorizationError);

      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [logged, ...rest] = logger.debug.mock.calls[0];
      expect(typeof logged).toBe('string');
      expect(rest).toEqual([]);
      expect(logged).toBe('Issue in fetching data sources [403]: Authorization Exception');
      expect(logged).not.toContain('backend_roles');
    });
  });

  describe('route handlers', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      registerDataConnectionsRoute(router, false, logger);
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    const mockCallAsCurrentUserRejection = (error: any) => {
      mockContext.observability_plugin.observabilityClient.asScoped.mockReturnValue({
        callAsCurrentUser: jest.fn().mockRejectedValue(error),
      });
    };

    it('GET /dataconnections returns 403 and logs at debug level without writing to the console', async () => {
      mockCallAsCurrentUserRejection(authorizationError);
      mockRequest = httpServerMock.createOpenSearchDashboardsRequest();

      // Route order: GET /{name}, DELETE /{name}, POST edit, POST status, POST create, GET list, ...
      const listHandler = router.get.mock.calls[1][1];
      await listHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.custom).toHaveBeenCalledWith({
        statusCode: 403,
        body: authorizationError.response,
      });
      expect(logger.debug).toHaveBeenCalledWith(
        'Issue in fetching data sources [403]: Authorization Exception'
      );
      expect(logger.error).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('GET /dataconnections/dataSourceMDSId= logs unexpected errors at error level', async () => {
      mockCallAsCurrentUserRejection({ statusCode: 500, message: 'Internal Server Error' });
      mockRequest = httpServerMock.createOpenSearchDashboardsRequest({
        params: { dataSourceMDSId: '' },
      });

      const mdsListHandler = router.get.mock.calls[2][1];
      await mdsListHandler(mockContext, mockRequest, mockResponse);

      expect(mockResponse.custom).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 500 })
      );
      expect(logger.error).toHaveBeenCalledWith(
        'Issue in fetching data sources [500]: Internal Server Error'
      );
      expect(logger.debug).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });
});
