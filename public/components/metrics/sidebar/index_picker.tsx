/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiCompressedComboBox, EuiTitle } from '@elastic/eui';
import React, { useState } from 'react';

export const IndexPicker = (props: { otelIndices: unknown; setSelectedOTIndex: unknown }) => {
  const { otelIndices, setSelectedOTIndex } = props;
  const otelIndex = otelIndices.map((item: any) => {
    return { label: item.index };
  });
  const [selectedIndex, setSelectedIndex] = useState([]);

  const onChange = (selectedIndex) => {
    setSelectedIndex(selectedIndex);
    setSelectedOTIndex(selectedIndex);
  };

  return (
    <div className="metrics-index-picker">
      <EuiTitle size="xxxs">
        <h5>Otel Index</h5>
      </EuiTitle>
      <EuiCompressedComboBox
        placeholder="Select an index"
        singleSelection={{ asPlainText: true }}
        options={otelIndex}
        selectedOptions={selectedIndex}
        onChange={onChange}
        data-test-subj="metricsIndexPicker"
      />
    </div>
  );
};
