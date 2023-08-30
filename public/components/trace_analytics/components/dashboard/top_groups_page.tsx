/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSpacer } from '@elastic/eui';
import React, { useState } from 'react';
import { FilterType } from '../common/filters/filters';
import { ErrorRatePlt } from '../common/plots/error_rate_plt';
import { ThroughputPlt } from '../common/plots/throughput_plt';
import { ErrorRatesTable } from './top_error_rates_table';
import { LatencyTable } from './top_latency_table';

export function TopGroupsPage(props: {
  filters: FilterType[];
  addFilter: (filter: FilterType) => void;
  addFilters: (filter: FilterType[]) => void;
  addPercentileFilter: (condition?: 'gte' | 'lte', additionalFilters?: FilterType[]) => void;
  setRedirect: (redirect: boolean) => void;
  loading: boolean;
  page: 'dashboard' | 'traces' | 'services' | 'app';
  throughPutItems: { items: any[]; fixedInterval: string };
  jaegerErrorRatePltItems: { items: any[]; fixedInterval: string };
  jaegerErrorTableItems: any[];
  jaegerTableItems: any[];
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
}) {
  const toggleButtons = [
    {
      id: 'error_rate',
      label: 'Errors',
      'data-test-subj': 'errors-toggle'
    },
    {
      id: 'throughput',
      label: 'Request rate',
      'data-test-subj': 'throughput-toggle'
    },
  ];
  const [idSelected, setIdSelected] = useState('error_rate');
  return (
    <>
      {idSelected === 'error_rate' ? (
        <>
          <EuiSpacer size="m" />
          <ErrorRatePlt
            items={props.jaegerErrorRatePltItems}
            setStartTime={props.setStartTime}
            setEndTime={props.setEndTime}
            setIdSelected={(mode: string) => setIdSelected(mode)}
            idSelected={idSelected}
            toggleButtons={toggleButtons}
          />
          <ErrorRatesTable
            title={'Top 5 Service and Operation Errors'}
            items={props.jaegerErrorTableItems}
            {...props}
          />
        </>
      ) : (
        <>
          <ThroughputPlt
            items={props.throughPutItems}
            setStartTime={props.setStartTime}
            setEndTime={props.setEndTime}
            setIdSelected={(mode: string) => setIdSelected(mode)}
            idSelected={idSelected}
            toggleButtons={toggleButtons}
          />
          <LatencyTable
            title={'Top 5 Service and Operation Latency'}
            items={props.jaegerTableItems}
            {...props}
          />
        </>
      )}
    </>
  );
}
