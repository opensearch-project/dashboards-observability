/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiSearchBar, EuiTitle } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { EuiComboBoxOptionOption } from '@opensearch-project/oui';
import { useDispatch, useSelector } from 'react-redux';

export const IndexPicker = (props) => {
  const { otelIndices, setSelectedOTIndex } = props;
  const dispatch = useDispatch();
  const otelIndex = otelIndices.map((item: any) => {
    return { label: item.index };
  });
  //  const dataSource = useSelector(selectedDataSourcesSelector);
  const [selectedIndex, setSelectedIndex] = useState();

  const onChange = (
    // eslint-disable-next-line no-shadow
    selectedIndex: React.SetStateAction<Array<{ label: string }>>
  ) => {
    setSelectedIndex(selectedIndex);
    console.log('it does come here: ', selectedIndex);
    setSelectedOTIndex(selectedIndex);
    // dispatch(setSelectedOtelIndex(selectedIndex));
  };

  return (
    <div className="metrics-index-picker" data-test-subj="metricsIndexPicker">
      <EuiTitle size="xxxs">
        <h5>Otel Index</h5>
      </EuiTitle>
      <EuiComboBox
        // aria-label="Accessible screen reader label"
        placeholder="Select an index"
        singleSelection={{ asPlainText: true }}
        options={otelIndex}
        selectedOptions={selectedIndex}
        onChange={onChange}
      />
    </div>
  );
};
