/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiAvatar,
  EuiButton,
  EuiFacetButton,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiText,
  EuiSchemaItem,
  EuiToken,
} from '@elastic/eui';
import { useSelector } from 'react-redux';
import { metricIconsSelector } from '../redux/slices/metrics_slice';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';

const MetricIcon = ({ metric }) => {
  const metricIcons = useSelector(metricIconsSelector);
  const iconMeta = metricIcons[metric.catalog];
  if (metric.catalog === OBSERVABILITY_CUSTOM_METRIC)
    return <EuiIcon title="OpenSearch" type="logoOpenSearch" size="l" />;
  else
    return (
      <EuiToken
        iconType="tokenConstant"
        title={metric.catalog}
        iconSize="s"
        size="s"
        fill="none"
        {...iconMeta}
      />
    );
};

interface IMetricNameProps {
  metric: any;
  handleClick: (props: any) => void;
  showRemoveIcon: boolean;
}

export const MetricName = (props: IMetricNameProps) => {
  const { metric, handleClick, showRemoveIcon } = props;

  const actions = showRemoveIcon
    ? [
        {
          iconType: 'minusInCircle',
          onClick: () => handleClick(metric),
          'aria-label': 'Remove from Selected',
        },
      ]
    : [
        {
          iconType: 'plusInCircle',
          onClick: () => handleClick(metric),
          'aria-label': 'Add to Selected',
        },
      ];
  const logo =
    metric.catalog === OBSERVABILITY_CUSTOM_METRIC
      ? 'logoOpenSearch'
      : () => <MetricIcon metric={metric} />;

  const name = () => {
    if (metric.catalog === 'CUSTOM_METRICS') return metric.name;
    else return metric.name.split('.')[1].replace(/^prometheus_/, 'p.._');
  };

  return (
    <EuiSchemaItem
      className="obsMetric-Name eui-textTruncate readonly"
      iconType={logo}
      label={name()}
      withPanel={false}
      actions={actions}
      compressed
    />
  );
};
