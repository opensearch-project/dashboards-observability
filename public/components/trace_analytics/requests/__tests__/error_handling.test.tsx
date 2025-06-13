/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import { handleError } from '../helper_functions';
import { handleDslRequest } from '../request_handler';
import { coreRefs } from '../../../../../public/framework/core_refs';
import { CoreStart } from '../../../../../../../src/core/public';

const mockAddDanger = jest.fn();
const mockCoreRefs = {
  core: {
    notifications: {
      toasts: {
        addDanger: mockAddDanger,
      },
    },
  },
};

const mockHttp: jest.Mocked<CoreStart['http']> = {
  post: jest.fn(),
  get: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  head: jest.fn(),
  patch: jest.fn(),
  options: jest.fn(),
  basePath: {
    prepend: jest.fn(),
    remove: jest.fn(),
    serverBasePath: '',
    get: jest.fn(),
    getBasePath: jest.fn(),
  },
  anonymousPaths: {
    isAnonymous: jest.fn(),
    register: jest.fn(),
  },
  intercept: jest.fn(),
  fetch: jest.fn(),
  addLoadingCountSource: jest.fn(),
  getLoadingCount$: jest.fn(),
};

describe('Trace Analytics Error Handling', () => {
  configure({ adapter: new Adapter() });

  beforeEach(() => {
    jest.clearAllMocks();
    // @ts-ignore
    coreRefs.core = mockCoreRefs.core;
  });

  describe('handleError function', () => {
    it('should display rate limit message for 429 circuit breaking exception', () => {
      const error = {
        statusCode: 429,
        response: JSON.stringify({
          error: {
            type: 'circuit_breaking_exception',
            reason: '[parent] Data too large',
          },
        }),
      };

      handleError(error);

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 429',
        text: 'Too many requests. The system is currently overloaded, please try again later.',
        toastLifeTimeMs: 10000,
      });
    });

    it('should display service unavailable message for 503 status code', () => {
      const error = {
        status: 503,
        reason: 'Service temporarily unavailable',
      };

      handleError(error);

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 503',
        text:
          'Service temporarily unavailable. The system might be under maintenance or overloaded.',
        toastLifeTimeMs: 10000,
      });
    });

    it('should handle DataSourceError with search_phase_execution_exception correctly', () => {
      const error = {
        statusCode: 503,
        body: {
          error: {
            root_cause: [],
            type: 'search_phase_execution_exception',
            reason: '',
            phase: 'fetch',
            grouped: true,
            failed_shards: [],
            caused_by: {},
          },
          status: 503,
        },
        message: 'Data Source Error: [search_phase_execution_exception]',
      };

      handleError(error);

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 503',
        text:
          'Service temporarily unavailable. The system might be under maintenance or overloaded.',
        toastLifeTimeMs: 10000,
      });
    });

    it('should display timeout message for 504 gateway timeout', () => {
      const error = {
        statusCode: 504,
        message: 'Request timed out',
      };

      handleError(error);

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 504',
        text: 'Request timed out. The operation took too long to complete.',
        toastLifeTimeMs: 10000,
      });
    });

    it('should display bucket limit message for too_many_buckets_exception', () => {
      const error = {
        body: {
          error: {
            type: 'too_many_buckets_exception',
            reason: 'Too many buckets',
          },
        },
      };

      handleError(error);

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 500',
        text:
          'Too many buckets in aggregation. Try using a shorter time range or increase the "search.max_buckets" cluster setting.',
        toastLifeTimeMs: 10000,
      });
    });

    it('should extract status code from parsedError.statusCode for HttpFetchError', () => {
      const error = {
        message: 'Service Unavailable',
        body: JSON.stringify({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'Data Source Error: [search_phase_execution_exception]',
        }),
      };

      handleError(error);

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 503',
        text:
          'Service temporarily unavailable. The system might be under maintenance or overloaded.',
        toastLifeTimeMs: 10000,
      });
    });
  });

  describe('handleDslRequest function', () => {
    it('should handle and display error toast when DSL request fails with 429', async () => {
      const error = {
        statusCode: 429,
        response: JSON.stringify({
          error: {
            type: 'circuit_breaking_exception',
            reason: '[parent] Data too large',
          },
        }),
      };

      mockHttp.post.mockRejectedValueOnce(error);

      await handleDslRequest(
        mockHttp,
        {},
        { query: { bool: { must: [], filter: [], should: [], must_not: [] } } },
        'data_prepper'
      );

      expect(mockAddDanger).toHaveBeenCalledWith({
        title: 'Error 429',
        text: 'Too many requests. The system is currently overloaded, please try again later.',
        toastLifeTimeMs: 10000,
      });
    });

    it('should trigger timeout toast when request exceeds 25 seconds', async () => {
      const mockSetShowTimeoutToast = jest.fn();
      jest.useFakeTimers();

      // Mock a long-running request that never resolves
      mockHttp.post.mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(resolve, 30000))
      );

      handleDslRequest(
        mockHttp,
        {},
        { query: { bool: { must: [], filter: [], should: [], must_not: [] } } },
        'data_prepper',
        undefined,
        mockSetShowTimeoutToast
      );

      // Advance time past the 25-second timeout threshold
      jest.advanceTimersByTime(25000);

      expect(mockSetShowTimeoutToast).toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('error scenarios integration tests', () => {
    const simulateRequestError = async (errorConfig: any) => {
      mockHttp.post.mockRejectedValueOnce(errorConfig);

      await handleDslRequest(
        mockHttp,
        {},
        { query: { bool: { must: [], filter: [], should: [], must_not: [] } } },
        'data_prepper'
      );

      return mockAddDanger.mock.calls[0][0];
    };

    it('should handle circuit breaker error end-to-end', async () => {
      const toast = await simulateRequestError({
        statusCode: 429,
        response: JSON.stringify({
          error: {
            type: 'circuit_breaking_exception',
            reason: '[parent] Data too large',
          },
        }),
      });

      expect(toast.title).toBe('Error 429');
      expect(toast.text).toContain('Too many requests');
    });

    it('should handle service unavailable error end-to-end', async () => {
      const toast = await simulateRequestError({
        status: 503,
        reason: 'Service temporarily unavailable',
      });

      expect(toast.title).toBe('Error 503');
      expect(toast.text).toContain('Service temporarily unavailable');
    });

    it('should handle timeout error end-to-end', async () => {
      const toast = await simulateRequestError({
        statusCode: 504,
        message: 'Request timed out',
      });

      expect(toast.title).toBe('Error 504');
      expect(toast.text).toContain('Request timed out');
    });
  });
});
