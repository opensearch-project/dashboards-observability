/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useFetchPatterns } from './use_fetch_patterns';
import { SELECTED_PATTERN_FIELD } from '../../../../common/constants/explorer';

const mockDispatch = jest.fn();
const mockFetchEvents = jest.fn();

jest.mock('react-redux', () => ({
  ...jest.requireActual('react-redux'),
  useDispatch: () => mockDispatch,
  useSelector: () => ({}),
  batch: (fn: () => void) => fn(),
}));

jest.mock('./use_fetch_events', () => ({
  useFetchEvents: () => ({
    isEventsLoading: false,
    fetchEvents: mockFetchEvents,
  }),
}));

describe('setDefaultPatternsField', () => {
  const defaultParams = {
    pplService: {} as any,
    mlCommonsRCFService: {} as any,
    requestParams: { tabId: 'tab-1' },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // By default, fetchEvents invokes the handler with the provided response
    mockFetchEvents.mockImplementation((_query, _format, handler) => {
      return Promise.resolve(handler?.({}));
    });
  });

  it('excludes text fields and selects keyword field', async () => {
    // describe response: body is text, traceId is not
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'COLUMN_NAME', type: 'string' },
            { name: 'TYPE_NAME', type: 'string' },
          ],
          datarows: [
            ['body', 'TEXT'],
            ['traceId', 'KEYWORD'],
          ],
        })
      );
    });
    // head 1 response: body has longer value but should be excluded
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'body', type: 'string' },
            { name: 'traceId', type: 'string' },
          ],
          jsonData: [{ body: 'a very long log message body text', traceId: 'abc123' }],
        })
      );
    });

    const { result } = renderHook(() => useFetchPatterns(defaultParams));
    await act(async () => {
      await result.current.setDefaultPatternsField('test_index', '', undefined);
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: { [SELECTED_PATTERN_FIELD]: 'traceId' },
        }),
      })
    );
  });

  it('selects longest string field when no text fields exist', async () => {
    // describe response: no text fields
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'COLUMN_NAME', type: 'string' },
            { name: 'TYPE_NAME', type: 'string' },
          ],
          datarows: [
            ['short', 'KEYWORD'],
            ['longer', 'KEYWORD'],
          ],
        })
      );
    });
    // head 1 response
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'short', type: 'string' },
            { name: 'longer', type: 'string' },
          ],
          jsonData: [{ short: 'hi', longer: 'hello world' }],
        })
      );
    });

    const { result } = renderHook(() => useFetchPatterns(defaultParams));
    await act(async () => {
      await result.current.setDefaultPatternsField('test_index', '', undefined);
    });

    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: { [SELECTED_PATTERN_FIELD]: 'longer' },
        }),
      })
    );
  });

  it('falls back gracefully when describe fails', async () => {
    // describe call throws
    mockFetchEvents.mockImplementationOnce(() => Promise.reject(new Error('describe failed')));
    // head 1 response still works
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'body', type: 'string' },
            { name: 'msg', type: 'string' },
          ],
          jsonData: [{ body: 'long body text here', msg: 'hi' }],
        })
      );
    });

    const { result } = renderHook(() => useFetchPatterns(defaultParams));
    await act(async () => {
      await result.current.setDefaultPatternsField('test_index', '', undefined);
    });

    // Without describe info, text fields aren't excluded — body wins as longest
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: { [SELECTED_PATTERN_FIELD]: 'body' },
        }),
      })
    );
  });

  it('handles undefined/null/non-string field values without crashing', async () => {
    // describe: no text fields
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'COLUMN_NAME', type: 'string' },
            { name: 'TYPE_NAME', type: 'string' },
          ],
          datarows: [
            ['fieldA', 'KEYWORD'],
            ['fieldB', 'KEYWORD'],
            ['fieldC', 'KEYWORD'],
          ],
        })
      );
    });
    // head 1: values are undefined, null, and a number
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'fieldA', type: 'string' },
            { name: 'fieldB', type: 'string' },
            { name: 'fieldC', type: 'string' },
            { name: 'fieldD', type: 'string' },
          ],
          jsonData: [{ fieldA: undefined, fieldB: null, fieldC: 12345, fieldD: 'valid' }],
        })
      );
    });

    const { result } = renderHook(() => useFetchPatterns(defaultParams));
    await act(async () => {
      await result.current.setDefaultPatternsField('test_index', '', undefined);
    });

    // Only fieldD has a valid string value
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: { [SELECTED_PATTERN_FIELD]: 'fieldD' },
        }),
      })
    );
  });

  it('falls back to text fields when all string fields are text-only', async () => {
    // describe: all fields are text
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'COLUMN_NAME', type: 'string' },
            { name: 'TYPE_NAME', type: 'string' },
          ],
          datarows: [
            ['body', 'TEXT'],
            ['message', 'TEXT'],
          ],
        })
      );
    });
    // head 1 response
    mockFetchEvents.mockImplementationOnce((_q, _f, handler) => {
      return Promise.resolve(
        handler({
          schema: [
            { name: 'body', type: 'string' },
            { name: 'message', type: 'string' },
          ],
          jsonData: [{ body: 'short', message: 'a longer message field value' }],
        })
      );
    });

    const { result } = renderHook(() => useFetchPatterns(defaultParams));
    await act(async () => {
      await result.current.setDefaultPatternsField('test_index', '', undefined);
    });

    // Fallback picks longest from all string fields including text
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: { [SELECTED_PATTERN_FIELD]: 'message' },
        }),
      })
    );
  });

  it('dispatches provided patternField directly when already set', async () => {
    const { result } = renderHook(() => useFetchPatterns(defaultParams));
    await act(async () => {
      await result.current.setDefaultPatternsField('test_index', 'existingField', undefined);
    });

    // Should not call fetchEvents at all
    expect(mockFetchEvents).not.toHaveBeenCalled();
    expect(mockDispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          query: { [SELECTED_PATTERN_FIELD]: 'existingField' },
        }),
      })
    );
  });
});
