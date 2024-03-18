/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react-hooks';
import { useAccelerationOperation } from '../manage/accelerations/acceleration_operation';
import * as useDirectQueryModule from '../../../../framework/datasources/direct_query_hook';
import * as useToastModule from '../../../common/toast';
import { DirectQueryLoadingStatus } from '../../../../../common/types/explorer';
import { skippingIndexAcceleration } from '../../../../../test/datasources';

jest.mock('../../../../framework/datasources/direct_query_hook', () => ({
  useDirectQuery: jest.fn(),
}));

jest.mock('../../../common/toast', () => ({
  useToast: jest.fn(),
}));

describe('useAccelerationOperation', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useDirectQueryModule.useDirectQuery as jest.Mock).mockReturnValue({
      startLoading: jest.fn(),
      stopLoading: jest.fn(),
      loadStatus: DirectQueryLoadingStatus.INITIAL,
    });

    (useToastModule.useToast as jest.Mock).mockReturnValue({
      setToast: jest.fn(),
    });
  });

  it('performs acceleration operation and handles success', async () => {
    (useDirectQueryModule.useDirectQuery as jest.Mock).mockReturnValue({
      startLoading: jest.fn(),
      stopLoading: jest.fn(),
      loadStatus: DirectQueryLoadingStatus.SUCCESS,
    });

    const { result } = renderHook(() => useAccelerationOperation('test-datasource'));

    act(() => {
      result.current.performOperation(skippingIndexAcceleration, 'delete');
    });

    expect((useDirectQueryModule.useDirectQuery as jest.Mock).mock.calls.length).toBeGreaterThan(0);
    expect((useToastModule.useToast as jest.Mock).mock.calls.length).toBeGreaterThan(0);
  });
});
