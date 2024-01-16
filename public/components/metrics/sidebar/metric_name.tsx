/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiFacetButton, EuiIcon } from '@elastic/eui';
import { OBSERVABILITY_CUSTOM_METRIC, OPEN_TELEMETRY } from '../../../../common/constants/metrics';

const MetricIcon = ({ metric }) => {
  const metricCatalog = metric?.catalog;
  if ([OBSERVABILITY_CUSTOM_METRIC, OPEN_TELEMETRY].includes(metricCatalog)) {
    return <EuiIcon title="OpenSearch" type="logoOpenSearch" size="l" />;
  } else return <EuiIcon title="OpenSearch" type="logoOpenSearch" size="l" />;
};

interface IMetricNameProps {
  metric: any;
  handleClick: (props: any) => void;
}

export const MetricName = (props: IMetricNameProps) => {
  const { metric, handleClick } = props;

  const name = (metricDetails: any) => {
    if (
      metricDetails?.catalog === OBSERVABILITY_CUSTOM_METRIC ||
      metricDetails?.catalog === OPEN_TELEMETRY
    )
      return metricDetails?.name;
    else return metricDetails?.name.split('.')[1].replace(/^prometheus_/, 'p.._');
  };

  return (
    <EuiFacetButton
      className="obsMetric-Name eui-textTruncate"
      title={metric?.name}
      onClick={() => handleClick(metric)}
      icon={<MetricIcon metric={metric} />}
    >
      {name(metric)}
    </EuiFacetButton>
  );
};
