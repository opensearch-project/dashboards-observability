/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSearchBar } from '@elastic/eui';
import React from 'react';
import { useDispatch } from 'react-redux';
import { debounce } from 'lodash';
import { clearSearchedMetrics, searchMetric } from '../redux/slices/metrics_slice';

interface ISearchBarProps {
  setSearch: React.Dispatch<React.SetStateAction<boolean>>;
}

export const SearchBar = (props: ISearchBarProps) => {
  const dispatch = useDispatch();

  const onChange = debounce(({ query }: { query: any }) => {
    if (query.text !== '') {
      dispatch(searchMetric(query.text));
    } else {
      dispatch(clearSearchedMetrics());
    }
  }, 300);

  return (
    <div className="metrics-search-bar-input" data-test-subj="metricsSearch">
      <EuiSearchBar
        box={{
          placeholder: 'Search for metrics',
          incremental: true,
        }}
        defaultQuery={''}
        onChange={onChange}
      />
    </div>
  );
};
