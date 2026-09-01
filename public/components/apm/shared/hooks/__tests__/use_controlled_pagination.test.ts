/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderHook, act } from '@testing-library/react';
import { useControlledPagination } from '../use_controlled_pagination';

describe('useControlledPagination', () => {
  it('should default to the first page and the default page size', () => {
    const { result } = renderHook(() => useControlledPagination(100));
    expect(result.current.pageIndex).toBe(0);
    expect(result.current.pageSize).toBe(10);
  });

  it('should track pageIndex and pageSize from onTableChange', () => {
    const { result } = renderHook(() => useControlledPagination(100));

    act(() => {
      result.current.onTableChange({ page: { index: 2, size: 25 } });
    });

    expect(result.current.pageIndex).toBe(2);
    expect(result.current.pageSize).toBe(25);
  });

  it('should clamp and persist the page index when the row count shrinks below the current page', () => {
    const { result, rerender } = renderHook(({ count }) => useControlledPagination(count), {
      initialProps: { count: 100 },
    });

    act(() => {
      result.current.onTableChange({ page: { index: 3, size: 10 } });
    });
    expect(result.current.pageIndex).toBe(3);

    // Shrink to 15 rows => 2 pages (indices 0..1); page 3 clamps to 1.
    rerender({ count: 15 });
    expect(result.current.pageIndex).toBe(1);

    // Grow back to 100 rows: because the clamp was persisted to state, the stale page 3 is
    // not resurrected — the user stays on the page they were viewing.
    rerender({ count: 100 });
    expect(result.current.pageIndex).toBe(1);
  });

  it('should clamp to page 0 when there are no rows', () => {
    const { result, rerender } = renderHook(({ count }) => useControlledPagination(count), {
      initialProps: { count: 100 },
    });

    act(() => {
      result.current.onTableChange({ page: { index: 4, size: 10 } });
    });

    rerender({ count: 0 });
    expect(result.current.pageIndex).toBe(0);
  });

  it('should return to the first page when resetPage is called', () => {
    const { result } = renderHook(() => useControlledPagination(100));

    act(() => {
      result.current.onTableChange({ page: { index: 2, size: 10 } });
    });
    expect(result.current.pageIndex).toBe(2);

    act(() => {
      result.current.resetPage();
    });
    expect(result.current.pageIndex).toBe(0);
  });
});
