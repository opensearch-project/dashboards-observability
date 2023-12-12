/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiTitle } from '@elastic/eui';
import React from 'react';
import { DATASOURCE_OPTIONS } from '../../../../common/constants/metrics';

export const DataSourcePicker = (props) => {
  const { selectedDataSource, setSelectedDataSource } = props;

  const onChange = (
    // eslint-disable-next-line no-shadow
    selectedDataSource: React.SetStateAction<Array<{ label: string; 'data-test-subj': string }>>
  ) => {
    setSelectedDataSource(selectedDataSource);
  };

  return (
    <div className="metrics-data-source-picker" data-test-subj="metricsDataSourcePicker">
      <EuiTitle size="xxxs">
        <h5>Data source</h5>
      </EuiTitle>
      <EuiComboBox
        // aria-label="Accessible screen reader label"
        placeholder="Select a data source"
        singleSelection={{ asPlainText: true }}
        options={DATASOURCE_OPTIONS}
        selectedOptions={selectedDataSource}
        onChange={onChange}
      />
    </div>
  );
};
