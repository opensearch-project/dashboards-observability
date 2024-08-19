/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCompressedComboBox, EuiTitle } from '@elastic/eui';
import React from 'react';
import { DATASOURCE_OPTIONS } from '../../../../common/constants/metrics';
import { OptionType } from '../../../../common/types/metrics';

interface DataSourcePickerMenuProps {
  selectedDataSource: OptionType[];
  setSelectedDataSource: (sources: OptionType[]) => void;
}

export const DataSourcePicker = ({
  selectedDataSource,
  setSelectedDataSource,
}: DataSourcePickerMenuProps) => {
  const onChange = (selectedMetricSource) => {
    setSelectedDataSource(selectedMetricSource);
  };

  return (
    <div className="metrics-data-source-picker">
      <EuiTitle size="xxxs">
        <h5>Metrics source</h5>
      </EuiTitle>
      <EuiCompressedComboBox
        placeholder="Select a metric source"
        singleSelection={{ asPlainText: true }}
        options={DATASOURCE_OPTIONS}
        selectedOptions={selectedDataSource || []}
        onChange={onChange}
        data-test-subj="metricsDataSourcePicker"
      />
    </div>
  );
};
