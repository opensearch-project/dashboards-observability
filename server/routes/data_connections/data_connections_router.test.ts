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
import {
  logDataConnectionError,
  registerDataConnectionsRoute,
  sanitizeDataConnectionErrorMessage,
} from './data_connections_router';

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
  // plugin rejects `GET /_plugins/_query/_datasources` for a user without permission. The legacy
  // client surfaces the backend reason as `error.message`, and the security plugin appends the
  // requesting user and its backend roles to that reason — exactly the content we must keep out
  // of the logs.
  const authorizationReason =
    'no permissions for [cluster:admin/opensearch/ql/datasources/read] and User [name=test-user, backend_roles=[read-only], requestedTenant=]';
  const authorizationError = Object.assign(
    new Error(`[security_exception] ${authorizationReason}`),
    {
      statusCode: 403,
      displayName: 'AuthorizationException',
      path: '/_plugins/_query/_datasources',
      body: {
        status: 403,
        error: {
          type: 'security_exception',
          reason: authorizationReason,
        },
      },
      response: '{"status":403}',
    }
  );
  const sanitizedAuthorizationSummary =
    'Issue in fetching data sources [403]: [security_exception] no permissions for [cluster:admin/opensearch/ql/datasources/read]';

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

    it('falls back to body.status (OpenSearch error bodies use status, not statusCode)', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', {
        body: { status: 403 },
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

    it('does not render a thrown non-Error object as [object Object]', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', { foo: 'bar' });

      expect(logger.error).toHaveBeenCalledWith(
        'Issue in fetching data sources [unknown]: Unknown error'
      );
      expect(logger.error.mock.calls[0][0]).not.toContain('[object Object]');
    });

    it('logs a single-line summary and strips the user/role segment from the message', () => {
      logDataConnectionError(logger, 'Issue in fetching data sources', authorizationError);

      expect(logger.debug).toHaveBeenCalledTimes(1);
      const [logged, ...rest] = logger.debug.mock.calls[0];
      expect(typeof logged).toBe('string');
      expect(rest).toEqual([]);
      expect(logged).toBe(sanitizedAuthorizationSummary);
      // The permission that was denied is still useful and is kept; the user and its roles are not.
      expect(logged).toContain('no permissions for');
      expect(logged).not.toContain('User [');
      expect(logged).not.toContain('name=test-user');
      expect(logged).not.toContain('backend_roles');
    });
  });

  describe('sanitizeDataConnectionErrorMessage', () => {
    it('strips a trailing "and User [...]" segment including nested brackets', () => {
      expect(sanitizeDataConnectionErrorMessage(authorizationError)).toBe(
        '[security_exception] no permissions for [cluster:admin/opensearch/ql/datasources/read]'
      );
    });

    it('returns a plain message unchanged', () => {
      expect(sanitizeDataConnectionErrorMessage(new Error('socket hang up'))).toBe(
        'socket hang up'
      );
    });

    it('handles a string error', () => {
      expect(sanitizeDataConnectionErrorMessage('boom')).toBe('boom');
    });

    it('returns "Unknown error" for a value with no usable message', () => {
      expect(sanitizeDataConnectionErrorMessage({ foo: 'bar' })).toBe('Unknown error');
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
      expect(logger.debug).toHaveBeenCalledWith(sanitizedAuthorizationSummary);
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
