/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiTitle } from '@elastic/eui';
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
  const onChange = (selectedDataSource) => {
    setSelectedDataSource(selectedDataSource);
  };

  return (
    <div className="metrics-data-source-picker">
      <EuiTitle size="xxxs">
        <h5>Data source</h5>
      </EuiTitle>
      <EuiComboBox
        placeholder="Select a data source"
        singleSelection={{ asPlainText: true }}
        options={DATASOURCE_OPTIONS}
        selectedOptions={selectedDataSource || []}
        onChange={onChange}
        data-test-subj="metricsDataSourcePicker"
      />
    </div>
  );
};
