/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useState } from 'react';
import { Criteria } from '@elastic/eui';
import { SERVICE_DETAILS_CONSTANTS } from '../../common/constants';

export interface ControlledPagination<T> {
  /** Clamped page index safe to pass to EuiInMemoryTable's controlled pagination. */
  pageIndex: number;
  /** Current page size, driven by the table's page-size selector. */
  pageSize: number;
  /** Wire to EuiInMemoryTable's onTableChange to keep pageIndex/pageSize in state. */
  onTableChange: (criteria: Criteria<T>) => void;
  /**
   * Reset to the first page. Call from filter user-actions (search, selections,
   * range sliders, clear-all) where the user expects to land on page 1.
   * Do NOT call it on a latency-percentile switch — that keeps the same rows and
   * the current page must be preserved.
   */
  resetPage: () => void;
}

/**
 * Controlled pagination for the service-details tables. Pagination must be controlled so a
 * latency-percentile switch (which rebuilds the items array) preserves the page instead of
 * resetting to 0; callers therefore call resetPage() themselves on filter changes.
 *
 * @param itemCount post-filter row count, used to clamp the page index.
 */
export function useControlledPagination<T>(itemCount: number): ControlledPagination<T> {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<number>(SERVICE_DETAILS_CONSTANTS.DEFAULT_PAGE_SIZE);

  const onTableChange = useCallback(({ page }: Criteria<T>) => {
    if (page) {
      setPageIndex(page.index);
      setPageSize(page.size);
    }
  }, []);

  const resetPage = useCallback(() => setPageIndex(0), []);

  // Clamp to the last valid page so a shrunk result set (e.g. a background refetch) never lands
  // on an empty page. Adjusting state during render (a supported React pattern) persists the
  // clamp, so a later growth of the result set can't resurrect the stale higher page.
  const lastPageIndex = Math.max(0, Math.ceil(itemCount / pageSize) - 1);
  if (pageIndex > lastPageIndex) {
    setPageIndex(lastPageIndex);
  }
  const clampedPageIndex = Math.min(pageIndex, lastPageIndex);

  return { pageIndex: clampedPageIndex, pageSize, onTableChange, resetPage };
}
