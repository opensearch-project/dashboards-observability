/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiAvatar, EuiFacetButton, EuiIcon } from '@elastic/eui';
import { useSelector } from 'react-redux';
import { metricIconsSelector } from '../redux/slices/metrics_slice';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';

const MetricIcon = ({ metric }) => {
  const metricIcons = useSelector(metricIconsSelector);
  const iconMeta = metricIcons[metric.catalog];
  if (metric.catalog === OBSERVABILITY_CUSTOM_METRIC)
    return <EuiIcon title="OpenSearch" type="logoOpenSearch" size="l" />;
  else return <EuiAvatar name={metric.catalog} size="s" type="space" {...iconMeta} />;
};

interface IMetricNameProps {
  metric: any;
  handleClick: (props: any) => void;
}

export const MetricName = (props: IMetricNameProps) => {
  const { metric, handleClick } = props;

  const name = () => {
    if (metric.catalog === 'CUSTOM_METRICS') return metric.name;
    else return metric.name.split('.')[1].replace(/^prometheus_/, 'p.._');
  };

  return (
    <EuiFacetButton
      className="obsMetric-Name eui-textTruncate"
      title={metric.name}
      onClick={() => handleClick(metric)}
      icon={<MetricIcon metric={metric} />}
    >
      {name(metric)}
    </EuiFacetButton>
  );
};
