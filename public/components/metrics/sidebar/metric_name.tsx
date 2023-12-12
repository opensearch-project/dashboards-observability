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
  const iconMeta = metricIcons[metric?.catalog];
  // console.log('iconMeta: ', iconMeta);
  const metricCatalog = metric?.catalog;
  // console.log('metricCatalog: ', metricCatalog);
  if (metric?.catalog === OBSERVABILITY_CUSTOM_METRIC || metric?.catalog === 'OpenTelemetry') {
    // console.log('satisfies this condition');
    return <EuiIcon title="OpenSearch" type="logoOpenSearch" size="l" />;
  } else return <EuiIcon title="OpenSearch" type="logoOpenSearch" size="l" />;
  // } else return <EuiAvatar name={metricCatalog} size="s" type="space" {...iconMeta} />;
};

interface IMetricNameProps {
  metric: any;
  handleClick: (props: any) => void;
}

export const MetricName = (props: IMetricNameProps) => {
  const { metric, handleClick } = props;

  const name = (metricDetails: any) => {
    if (metricDetails?.catalog === 'CUSTOM_METRICS' || metricDetails?.catalog === 'OpenTelemetry')
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
