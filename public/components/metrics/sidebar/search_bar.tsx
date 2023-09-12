/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSearchBar } from '@elastic/eui';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { debounce } from 'lodash';
import { useMetricStore, searchSelector } from '../metrics_store';

export const SearchBar = () => {
  const searchText = useMetricStore(searchSelector);
  const setSearch = useMetricStore((state) => state.setSearch);

  const onChange = debounce(({ query }) => {
    setSearch(query.text);
  }, 300);

  return (
    <div className="metrics-search-bar-input" data-test-subj="metricsSearch">
      <EuiSearchBar
        box={{
          placeholder: 'Search for metrics',
          incremental: true,
        }}
        defaultQuery={''}
        query={searchText}
        onChange={onChange}
      />
    </div>
  );
};
