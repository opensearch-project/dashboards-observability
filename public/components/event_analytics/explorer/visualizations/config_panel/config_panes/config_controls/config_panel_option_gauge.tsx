/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { EuiFormRow, EuiFieldNumber } from '@elastic/eui';
import { DefaultGaugeChartParameters } from '../../../../../../../../common/constants/explorer';

const helpText = `Limit number of gauges.`;

export const ConfigPanelOptionGauge = ({
  visualizations,
  vizState,
  panelOptionsValues,
  handleConfigChange,
}: any) => {
  const { Gauge = {} } = visualizations?.data?.rawVizData;
  const isReadOnly = !(
    Gauge?.dataConfig?.dimensions?.length && Gauge?.dataConfig?.dimensions[0]?.name != ''
  );
  const [numberOfGauges, setNumberOfGauges] = useState<number>(
    DefaultGaugeChartParameters.DisplayDefaultGauges
  );

  useEffect(() => {
    if (!vizState) {
      setNumberOfGauges(DefaultGaugeChartParameters.DisplayDefaultGauges);
    }
  }, [vizState?.numberOfGauges]);

  return (
    <EuiFormRow fullWidth label="Number of gauges" helpText={helpText}>
      <EuiFieldNumber
        name="numberOfGauges"
        onChange={(e) => {
          setNumberOfGauges(Number(e.target.value));
        }}
        value={numberOfGauges}
        onBlur={() => {
          const newPanelOptions = {
            ...panelOptionsValues,
            numberOfGauges: numberOfGauges,
          };
          handleConfigChange(newPanelOptions);
        }}
        placeholder={'Number of gauges'}
        readOnly={isReadOnly}
      />
    </EuiFormRow>
  );
};
