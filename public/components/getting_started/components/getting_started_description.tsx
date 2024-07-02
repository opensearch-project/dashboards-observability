/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiHorizontalRule,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldSearch,
  EuiButtonGroup,
} from '@elastic/eui';
import React, { useState } from 'react';

export const GettingStartedDescription = () => {
  const [selectedFilter, setSelectedFilter] = useState('');

  const filterOptions = [
    { id: 'logs', label: 'Logs' },
    { id: 'traces', label: 'Traces' },
    { id: 'metrics', label: 'Metrics' },
  ];

  const onFilterChange = (optionId) => {
    setSelectedFilter(optionId);
  };

  return (
    <div>
      <EuiTitle size="s">
        <h2>Select what type of data you have.</h2>
      </EuiTitle>

      <EuiSpacer size="s" />
      <EuiText size="s" color="subdued">
        From the choices below.
      </EuiText>
      <EuiHorizontalRule size="full" />

      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFieldSearch
            placeholder="Search..."
            onChange={() => {}}
            isClearable
            aria-label="Search"
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonGroup
            legend="Filter data types"
            options={filterOptions}
            idSelected={selectedFilter}
            onChange={(id) => onFilterChange(id)}
            buttonSize="s"
            isFullWidth={false}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </div>
  );
};
