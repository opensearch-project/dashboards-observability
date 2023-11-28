/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiSearchBar, EuiTitle } from '@elastic/eui';
import React, { useState } from 'react';
import { EuiComboBoxOptionOption } from '@opensearch-project/oui';
import { useDispatch } from 'react-redux';
import { DATASOURCE_OPTIONS } from '../../../../common/constants/metrics';
import { setSelectedDataSource as selectedDataSourceSlice } from '../redux/slices/metrics_slice';

export const DataSourcePicker = (props) => {
  const { selectedDataSource, setSelectedDataSource } = props;
  const dispatch = useDispatch();
  //   const [selectedDataSource, setSelectedDataSource] = useState();

  const onChange = (
    // eslint-disable-next-line no-shadow
    selectedDataSource: React.SetStateAction<Array<{ label: string; 'data-test-subj': string }>>
  ) => {
    // console.log("maybe here");
    console.log('selectedDataSource in data pciker', selectedDataSource[0]);
    setSelectedDataSource(selectedDataSource);
    // dispatch(selectedDataSourceSlice(selectedDataSource[0]));
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
