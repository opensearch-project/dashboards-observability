/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiComboBox, EuiTitle } from '@elastic/eui';
import React, { useState } from 'react';

export const IndexPicker = (props) => {
  const { otelIndices, setSelectedOTIndex } = props;
  const otelIndex = otelIndices.map((item: any) => {
    return { label: item.index };
  });
  const [selectedIndex, setSelectedIndex] = useState([]);

  const onChange = (
    // eslint-disable-next-line no-shadow
    selectedIndex: React.SetStateAction<Array<{ label: string }>>
  ) => {
    setSelectedIndex(selectedIndex);
    setSelectedOTIndex(selectedIndex);
  };
  // console.log('inside index picker');

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
