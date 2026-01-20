/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  EuiText,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiBasicTable,
  EuiBasicTableColumn,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useTopServicesByFaultRate } from '../../hooks/use_top_services_by_fault_rate';
import { TimeRange } from '../../../common/types/service_types';
import { parseTimeRange } from '../../utils/time_utils';
import { FaultRateCell, getRelativePercentage } from './fault_rate_cell';
import { ServiceCell } from './service_cell';

// i18n translations
const i18nTexts = {
  title: i18n.translate('observability.apm.faultWidgets.services.title', {
    defaultMessage: 'Top Services by Fault Rate',
  }),
  columnService: i18n.translate('observability.apm.faultWidgets.services.columnService', {
    defaultMessage: 'Service',
  }),
  columnFaultRate: i18n.translate('observability.apm.faultWidgets.services.columnFaultRate', {
    defaultMessage: 'Fault Rate',
  }),
  prometheusRequired: i18n.translate('observability.apm.faultWidgets.services.prometheusRequired', {
    defaultMessage:
      'Prometheus connection required. Configure a Prometheus data source to view fault rate metrics.',
  }),
  noData: i18n.translate('observability.apm.faultWidgets.services.noData', {
    defaultMessage: 'No fault rate data available',
  }),
};

export interface TopServicesByFaultRateProps {
  timeRange: TimeRange;
  onServiceClick?: (serviceName: string, environment: string) => void;
  refreshTrigger?: number;
  searchQuery?: string;
}

interface ServiceFaultRateItem {
  serviceName: string;
  environment: string;
  faultRate: number;
  relativePercentage: number;
  href?: string;
}

/**
 * Widget displaying top services ranked by fault rate
 * Shows service name, environment, and fault rate percentage with progress bar
 */
export const TopServicesByFaultRate: React.FC<TopServicesByFaultRateProps> = ({
  timeRange,
  onServiceClick,
  refreshTrigger,
  searchQuery,
}) => {
  // Parse time range using datemath for proper handling of all relative formats
  // Recalculate when refreshTrigger changes to get fresh timestamps
  const { startTime, endTime } = useMemo(() => {
    return parseTimeRange(timeRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, refreshTrigger]);

  const { data: services, isLoading, error } = useTopServicesByFaultRate({
    startTime,
    endTime,
    limit: 5,
    refreshTrigger,
  });

  // Build table items with relative percentages for progress bars
  const tableItems: ServiceFaultRateItem[] = useMemo(() => {
    if (!services || services.length === 0) {
      return [];
    }

    // Filter by search query if provided
    let filteredServices = services;
    if (searchQuery?.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredServices = services.filter(
        (s) =>
          s.serviceName.toLowerCase().includes(query) || s.environment.toLowerCase().includes(query)
      );
    }

    // Calculate sum for relative percentages (capped at 100 in getRelativePercentage)
    const faultRateSum = filteredServices.reduce((sum, s) => sum + s.faultRate, 0);

    return filteredServices.map((service) => ({
      serviceName: service.serviceName,
      environment: service.environment,
      faultRate: service.faultRate,
      relativePercentage: getRelativePercentage(service.faultRate, faultRateSum),
      href: `#/service-details/${encodeURIComponent(service.serviceName)}/${encodeURIComponent(
        service.environment
      )}`,
    }));
  }, [services, searchQuery]);

  // Define table columns
  const columns: Array<EuiBasicTableColumn<ServiceFaultRateItem>> = [
    {
      name: i18nTexts.columnService,
      width: '40%',
      truncateText: true,
      render: (item: ServiceFaultRateItem) => (
        <ServiceCell
          service={item.serviceName}
          environment={item.environment}
          href={item.href}
          onClick={
            onServiceClick ? () => onServiceClick(item.serviceName, item.environment) : undefined
          }
        />
      ),
    },
    {
      name: i18nTexts.columnFaultRate,
      width: '60%',
      render: (item: ServiceFaultRateItem) => (
        <FaultRateCell faultRate={item.faultRate} relativePercentage={item.relativePercentage} />
      ),
    },
  ];

  if (isLoading) {
    return (
      <EuiFlexItem>
        <EuiPanel>
          <EuiText size="m">
            <h4>{i18nTexts.title}</h4>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiFlexGroup justifyContent="center" alignItems="center" style={{ minHeight: 150 }}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="l" />
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
      </EuiFlexItem>
    );
  }

  if (error) {
    const isConfigError = error.message.includes('No Prometheus connection configured');
    const isAuthError =
      error.message.includes('Unauthorized') || error.message.includes('Authentication');

    return (
      <EuiFlexItem>
        <EuiPanel>
          <EuiText size="m">
            <h4>{i18nTexts.title}</h4>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiText color="subdued" size="s">
            {isConfigError || isAuthError ? (
              <p>{i18nTexts.prometheusRequired}</p>
            ) : (
              <p>
                {i18n.translate('observability.apm.faultWidgets.services.error', {
                  defaultMessage: 'Error loading fault rate data: {errorMessage}',
                  values: { errorMessage: error.message },
                })}
              </p>
            )}
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>
    );
  }

  if (!services || services.length === 0) {
    return (
      <EuiFlexItem>
        <EuiPanel>
          <EuiText size="m">
            <h4>{i18nTexts.title}</h4>
          </EuiText>
          <EuiSpacer size="s" />
          <EuiText color="subdued" size="s">
            <p>{i18nTexts.noData}</p>
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>
    );
  }

  return (
    <EuiFlexItem>
      <EuiPanel>
        <EuiText size="m">
          <h4>{i18nTexts.title}</h4>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiBasicTable items={tableItems} columns={columns} tableLayout="auto" />
      </EuiPanel>
    </EuiFlexItem>
  );
};
