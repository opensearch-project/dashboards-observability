/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { EuiFacetButton, EuiIcon } from '@elastic/eui';

interface IMetricNameProps {
  metric: any;
  handleClick: (props: any) => void;
  showDeleteIcon: boolean;
}

export const MetricName = (props: IMetricNameProps) => {
  const { metric, handleClick, showDeleteIcon } = props;

  const icons = {
    empty: <EuiIcon type="empty" />,
    danger: <EuiIcon type="trash" color="danger" />,
    primary: <EuiIcon type="plusInCircleFilled" color="primary" />,
  };

  const [iconDisplay, setIconDisplay] = useState(false);
  const [icon, setIcon] = useState(icons.empty);

  const setIconFromButtonState = (buttonState: string) => {
    return setIcon(icons[buttonState]);
  };

  useEffect(() => {
    console.log({ iconDisplay, icon });
  }, [iconDisplay, icon]);

  useEffect(() => {
    const iconState = !iconDisplay ? 'empty' : showDeleteIcon ? 'danger' : 'primary';
    setIconFromButtonState(iconState);
  }, [iconDisplay]);

  const name = (metricName: string) => {
    return metric.catalog === 'CUSTOM_METRICS' ? metricName : metricName.split('.')[1];
  };

  return (
    <EuiFacetButton
      icon={icon}
      quantity={2}
      onClick={() => handleClick(metric)}
      onMouseOver={() => setIconDisplay(true)}
      onMouseOut={() => setIconDisplay(false)}
    >
      {metric.name}
    </EuiFacetButton>
  );
};
