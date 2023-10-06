/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiAccordion, EuiTitle } from '@elastic/eui';
import { min } from 'lodash';
import { MetricName } from './metric_name';
import { OBSERVABILITY_CUSTOM_METRIC } from '../../../../common/constants/metrics';

interface IMetricNameProps {
  metricsList: [];
  headerName: string;
  handleClick: (props: any) => void;
  dataTestSubj: string;
  showRemoveIcon?: boolean;
}

export const MetricsAccordion = (props: IMetricNameProps) => {
  const { metricsList, headerName, handleClick, dataTestSubj, showRemoveIcon } = props;

  return (
    <EuiAccordion
      initialIsOpen
      id={`${headerName}Selector`}
      buttonContent={
        <EuiTitle size="xxxs">
          <span>
            {headerName} {min([metricsList.length, 100])} of {metricsList.length}
          </span>
        </EuiTitle>
      }
      paddingSize="none"
    >
      <ul className="metricsList">
        {metricsList.slice(0, 100).map((metric: any) => (
          <li key={metric.id} className="metricsListContainer" data-test-subj={dataTestSubj}>
            <MetricName metric={metric} handleClick={handleClick} showRemoveIcon={showRemoveIcon} />
          </li>
        ))}
      </ul>
    </EuiAccordion>
  );
};
