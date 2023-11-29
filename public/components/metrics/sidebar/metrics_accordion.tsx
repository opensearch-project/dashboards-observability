/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiAccordion, EuiTitle } from '@elastic/eui';
import { min } from 'lodash';
import { useEffect } from 'react';
import { MetricName } from './metric_name';

interface IMetricNameProps {
  metricsList: any;
  headerName: string;
  handleClick: (props: any) => void;
  dataTestSubj: string;
}

export const MetricsAccordion = (props: IMetricNameProps) => {
  const { metricsList, headerName, handleClick, dataTestSubj } = props;
  // console.log('mertcs list type: ', typeof metricsList);
  console.log('mertcs list: ', metricsList);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const test = () => {
    metricsList.slice(0, 100).map((metric: any) => console.log('metric.id in test: ', metric?.id));
  };

  useEffect(() => {
    test();
  }, [metricsList, test]);

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
        {metricsList
          .map((m) => m)
          .map((metric: any) => (
            <li key={metric.id} className="metricsListContainer" data-test-subj={dataTestSubj}>
              <MetricName metric={metric} handleClick={handleClick} />
            </li>
          ))}
      </ul>
    </EuiAccordion>
  );
};
