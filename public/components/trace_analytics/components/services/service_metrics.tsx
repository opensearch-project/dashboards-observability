/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { DataSourceOption } from '../../../../../../../src/plugins/data_source_management/public';
import { ServiceTrends, TraceAnalyticsMode } from '../../../../../common/types/trace_analytics';
import { coreRefs } from '../../../../framework/core_refs';
import { handleServiceTrendsRequest } from '../../requests/services_request_handler';
import { ErrorRatePlt } from '../common/plots/error_rate_plt';
import { LatencyPltPanel } from '../common/plots/latency_trend_plt';
import { ThroughputPlt } from '../common/plots/throughput_plt';

interface ServiceMetricsProps {
  serviceName: string;
  fixedInterval: string;
  mode: TraceAnalyticsMode;
  dataSourceMDSId: DataSourceOption[];
  startTime: string;
  endTime: string;
  setStartTime: (startTime: string) => void;
  setEndTime: (startTime: string) => void;
  page: string;
}

export const ServiceMetrics = ({
  mode,
  dataSourceMDSId,
  setStartTime,
  setEndTime,
  page,
  serviceName,
}: ServiceMetricsProps) => {
  const [trends, setTrends] = useState<ServiceTrends>({});
  const { http } = coreRefs;

  const serviceFilter = [
    {
      term: {
        serviceName,
      },
    },
  ];

  const fetchMetrics = async () => {
    await handleServiceTrendsRequest(
      http,
      '1h',
      setTrends,
      mode,
      serviceFilter,
      dataSourceMDSId[0].id
    );
  };

  useEffect(() => {
    fetchMetrics();
  }, [serviceName]);

  const metricsView = page === 'serviceFlyout' ? 'column' : 'row';

  return (
    <>
      <EuiFlexGroup alignItems="baseline">
        <EuiFlexItem>
          <EuiFlexGroup direction={metricsView}>
            <EuiFlexItem>
              <ThroughputPlt
                title="24hr throughput trend"
                items={{
                  items: trends[serviceName]?.throughput ? [trends[serviceName]?.throughput] : [],
                  fixedInterval: '1h',
                }}
                setStartTime={setStartTime}
                setEndTime={setEndTime}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <ErrorRatePlt
                title="24hr error rate trend"
                items={{
                  items: trends[serviceName]?.error_rate ? [trends[serviceName]?.error_rate] : [],
                  fixedInterval: '1h',
                }}
                setStartTime={setStartTime}
                setEndTime={setEndTime}
              />
            </EuiFlexItem>
            <EuiFlexItem>
              <LatencyPltPanel data={trends[serviceName]?.latency_trend} isPanel={true} />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
