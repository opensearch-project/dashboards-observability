/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSearchBar } from '@elastic/eui';
import debounce from 'lodash/debounce';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { searchSelector, setSearch } from '../redux/slices/metrics_slice';

export const SearchBar = () => {
  const dispatch = useDispatch();
  const searchText = useSelector(searchSelector);

  const onChange = debounce(({ query }) => {
    dispatch(setSearch(query.text));
  }, 300);

  // OUI doesn't pass down the prop
  // Work around for OUI bug: https://github.com/opensearch-project/oui/issues/1343
  useEffect(() => {
    const element = document.querySelector('.euiFieldSearch');
    if (element) {
      element.classList.add('euiFieldSearch--compressed');
    }
  }, []);

  return (
    <div className="metrics-search-bar-input" data-test-subj="metricsSearch">
      <EuiSearchBar
        box={{
          placeholder: 'Search to filter Available Metrics',
          incremental: true,
        }}
        defaultQuery={''}
        query={searchText}
        onChange={onChange}
      />
    </div>
  );
};
