/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook } from '@testing-library/react-hooks';
import { SavedObjectsFindResponsePublic } from '../../../../../../../../src/core/public';
import { coreMock } from '../../../../../../../../src/core/public/mocks';
import * as coreServices from '../../../../../../common/utils/core_services';
import { coreRefs } from '../../../../../framework/core_refs';
import { genericReducer, useCatIndices, useGetIndexPatterns } from '../hooks';

const coreStartMock = coreMock.createStart();

describe('useCatIndices', () => {
  const httpMock = coreStartMock.http;

  beforeEach(() => {
    jest.spyOn(coreServices, 'getOSDHttp').mockReturnValue(httpMock);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return indices', async () => {
    httpMock.get.mockResolvedValueOnce([{ index: 'test1' }, { index: 'test2' }]);

    const { result, waitForNextUpdate } = renderHook(() => useCatIndices());
    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([{ label: 'test1' }, { label: 'test2' }]);
  });

  it('should handle errors', async () => {
    httpMock.get.mockRejectedValueOnce('API failed');

    const { result, waitForNextUpdate } = renderHook(() => useCatIndices());
    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toEqual('API failed');
  });
});

describe('useGetIndexPatterns', () => {
  const savedObjectsClientMock = coreStartMock.savedObjects.client as jest.Mocked<
    typeof coreStartMock.savedObjects.client
  >;

  beforeAll(() => {
    coreRefs.savedObjectsClient = savedObjectsClientMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return index patterns', async () => {
    savedObjectsClientMock.find.mockResolvedValueOnce({
      savedObjects: [{ attributes: { title: 'test1' } }, { attributes: { title: 'test2' } }],
    } as SavedObjectsFindResponsePublic);

    const { result, waitForNextUpdate } = renderHook(() => useGetIndexPatterns());
    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toEqual([{ label: 'test1' }, { label: 'test2' }]);
  });

  it('should handle errors', async () => {
    savedObjectsClientMock.find.mockRejectedValueOnce('API failed');

    const { result, waitForNextUpdate } = renderHook(() => useGetIndexPatterns());
    expect(result.current.loading).toBe(true);
    await waitForNextUpdate();
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe(undefined);
    expect(result.current.error).toEqual('API failed');
  });
});

describe('genericReducer', () => {
  it('should return original state', () => {
    expect(
      genericReducer(
        { data: { foo: 'bar' }, loading: false },
        // mock not supported type
        { type: ('not-supported-type' as unknown) as 'request' }
      )
    ).toEqual({
      data: { foo: 'bar' },
      loading: false,
    });
  });

  it('should return state follow request action', () => {
    expect(genericReducer({ data: { foo: 'bar' }, loading: false }, { type: 'request' })).toEqual({
      data: { foo: 'bar' },
      loading: true,
    });
  });

  it('should return state follow success action', () => {
    expect(
      genericReducer(
        { data: { foo: 'bar' }, loading: false },
        { type: 'success', payload: { foo: 'baz' } }
      )
    ).toEqual({
      data: { foo: 'baz' },
      loading: false,
    });
  });

  it('should return state follow failure action', () => {
    const error = new Error();
    expect(
      genericReducer({ data: { foo: 'bar' }, loading: false }, { type: 'failure', error })
    ).toEqual({
      error,
      loading: false,
    });
  });
});
