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
  EuiLink,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { useServiceDependenciesByFaultRate } from '../../hooks/use_service_dependencies_by_fault_rate';
import { TimeRange } from '../../../common/types/service_types';
import { parseTimeRange } from '../../utils/time_utils';
import { FaultRateCell, getRelativePercentage } from './fault_rate_cell';

// i18n translations
const i18nTexts = {
  title: i18n.translate('observability.apm.faultWidgets.serviceDependencies.title', {
    defaultMessage: 'Top dependencies by fault rate',
  }),
  columnDependencyService: i18n.translate(
    'observability.apm.faultWidgets.serviceDependencies.columnDependencyService',
    {
      defaultMessage: 'Dependency service',
    }
  ),
  columnFaultRate: i18n.translate(
    'observability.apm.faultWidgets.serviceDependencies.columnFaultRate',
    {
      defaultMessage: 'Fault rate',
    }
  ),
  prometheusRequired: i18n.translate(
    'observability.apm.faultWidgets.serviceDependencies.prometheusRequired',
    {
      defaultMessage:
        'Prometheus connection required. Configure a Prometheus data source to view dependency fault rate metrics.',
    }
  ),
  noData: i18n.translate('observability.apm.faultWidgets.serviceDependencies.noData', {
    defaultMessage: 'No dependency fault rate data available',
  }),
};

export interface ServiceDependenciesByFaultRateProps {
  serviceName: string;
  environment: string;
  timeRange: TimeRange;
  refreshTrigger?: number;
  onDependencyClick?: (dependencyService: string) => void;
}

interface DependencyFaultRateItem {
  remoteService: string;
  faultRate: number;
  relativePercentage: number;
}

/**
 * Widget displaying top dependencies by fault rate for a specific service
 * Shows only Remote Service and Fault Rate columns (service column removed since user already knows the service)
 */
export const ServiceDependenciesByFaultRate: React.FC<ServiceDependenciesByFaultRateProps> = ({
  serviceName,
  environment,
  timeRange,
  refreshTrigger,
  onDependencyClick,
}) => {
  // Parse time range using datemath for proper handling of relative dates
  const { startTime, endTime } = useMemo(() => {
    try {
      return parseTimeRange(timeRange);
    } catch (e) {
      // Fallback to last 15 minutes if parsing fails
      return {
        startTime: new Date(Date.now() - 15 * 60 * 1000),
        endTime: new Date(),
      };
    }
  }, [timeRange]);

  const { data: dependencies, isLoading, error } = useServiceDependenciesByFaultRate({
    serviceName,
    environment,
    startTime,
    endTime,
    limit: 5,
    refreshTrigger,
  });

  // Calculate relative percentages for progress bars
  const tableItems: DependencyFaultRateItem[] = useMemo(() => {
    if (!dependencies || dependencies.length === 0) {
      return [];
    }

    // Calculate sum for relative percentages
    const faultRateSum = dependencies.reduce((sum, d) => sum + d.faultRate, 0);

    return dependencies.map((dep) => ({
      remoteService: dep.remoteService,
      faultRate: dep.faultRate,
      relativePercentage: getRelativePercentage(dep.faultRate, faultRateSum),
    }));
  }, [dependencies]);

  // Define table columns - only 2 columns (no Service column)
  const columns: Array<EuiBasicTableColumn<DependencyFaultRateItem>> = [
    {
      field: 'remoteService',
      name: i18nTexts.columnDependencyService,
      width: '50%',
      truncateText: true,
      render: (remoteService: string) => (
        <EuiLink
          onClick={onDependencyClick ? () => onDependencyClick(remoteService) : undefined}
          style={{ cursor: onDependencyClick ? 'pointer' : 'default' }}
        >
          <EuiText size="s">
            <strong>{remoteService}</strong>
          </EuiText>
        </EuiLink>
      ),
    },
    {
      name: i18nTexts.columnFaultRate,
      width: '50%',
      render: (item: DependencyFaultRateItem) => (
        <FaultRateCell faultRate={item.faultRate} relativePercentage={item.relativePercentage} />
      ),
    },
  ];

  if (isLoading) {
    return (
      <EuiFlexItem>
        <EuiPanel>
          <EuiText size="s">
            <h4>{i18nTexts.title}</h4>
          </EuiText>
          <EuiSpacer size="xs" />
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
          <EuiText size="s">
            <h4>{i18nTexts.title}</h4>
          </EuiText>
          <EuiSpacer size="xs" />
          <EuiText color="subdued" size="s">
            {isConfigError || isAuthError ? (
              <p>{i18nTexts.prometheusRequired}</p>
            ) : (
              <p>
                {i18n.translate('observability.apm.faultWidgets.serviceDependencies.error', {
                  defaultMessage: 'Error loading dependency fault rate data: {errorMessage}',
                  values: { errorMessage: error.message },
                })}
              </p>
            )}
          </EuiText>
        </EuiPanel>
      </EuiFlexItem>
    );
  }

  if (!dependencies || dependencies.length === 0) {
    return (
      <EuiFlexItem>
        <EuiPanel>
          <EuiText size="s">
            <h4>{i18nTexts.title}</h4>
          </EuiText>
          <EuiSpacer size="xs" />
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
        <EuiText size="s">
          <h4>{i18nTexts.title}</h4>
        </EuiText>
        <EuiSpacer size="xs" />
        <EuiBasicTable items={tableItems} columns={columns} tableLayout="auto" />
      </EuiPanel>
    </EuiFlexItem>
  );
};
