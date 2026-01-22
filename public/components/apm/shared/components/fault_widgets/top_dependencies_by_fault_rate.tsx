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
import { useTopDependenciesByFaultRate } from '../../hooks/use_top_dependencies_by_fault_rate';
import { TimeRange } from '../../../common/types/service_types';
import { parseTimeRange } from '../../utils/time_utils';
import { FaultRateCell, getRelativePercentage } from './fault_rate_cell';
import { ServiceCell } from './service_cell';

// i18n translations
const i18nTexts = {
  title: i18n.translate('observability.apm.faultWidgets.dependencies.title', {
    defaultMessage: 'Top dependency paths by fault rate',
  }),
  columnDependencyService: i18n.translate(
    'observability.apm.faultWidgets.dependencies.columnDependencyService',
    {
      defaultMessage: 'Dependency service',
    }
  ),
  columnService: i18n.translate('observability.apm.faultWidgets.dependencies.columnService', {
    defaultMessage: 'Service',
  }),
  columnFaultRate: i18n.translate('observability.apm.faultWidgets.dependencies.columnFaultRate', {
    defaultMessage: 'Fault Rate',
  }),
  prometheusRequired: i18n.translate(
    'observability.apm.faultWidgets.dependencies.prometheusRequired',
    {
      defaultMessage:
        'Prometheus connection required. Configure a Prometheus data source to view dependency fault rate metrics.',
    }
  ),
  noData: i18n.translate('observability.apm.faultWidgets.dependencies.noData', {
    defaultMessage: 'No dependency fault rate data available',
  }),
};

export interface TopDependenciesByFaultRateProps {
  timeRange: TimeRange;
  refreshTrigger?: number;
  onServiceClick?: (serviceName: string, environment: string) => void;
  onDependencyClick?: (
    sourceService: string,
    dependencyService: string,
    environment: string
  ) => void;
  searchQuery?: string;
}

interface DependencyFaultRateItem {
  source: string;
  target: string;
  sourceEnvironment: string;
  faultRate: number;
  relativePercentage: number;
  sourceHref?: string;
}

/**
 * Widget displaying top service dependencies ranked by fault rate
 * Shows remote service -> calling service and fault rate percentage with progress bar
 */
export const TopDependenciesByFaultRate: React.FC<TopDependenciesByFaultRateProps> = ({
  timeRange,
  refreshTrigger,
  onServiceClick,
  onDependencyClick,
  searchQuery,
}) => {
  // Parse time range using datemath for proper handling of all relative formats
  // Recalculate when refreshTrigger changes to get fresh timestamps
  const { startTime, endTime } = useMemo(() => {
    return parseTimeRange(timeRange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeRange, refreshTrigger]);

  const { data: dependencies, isLoading, error } = useTopDependenciesByFaultRate({
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

    // Filter by search query if provided
    let filteredDependencies = dependencies;
    if (searchQuery?.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filteredDependencies = dependencies.filter(
        (d) =>
          d.source.toLowerCase().includes(query) ||
          d.target.toLowerCase().includes(query) ||
          d.environment.toLowerCase().includes(query)
      );
    }

    // Calculate sum for relative percentages
    const faultRateSum = filteredDependencies.reduce((sum, d) => sum + d.faultRate, 0);

    return filteredDependencies.map((dep) => ({
      source: dep.source,
      target: dep.target,
      sourceEnvironment: dep.environment,
      faultRate: dep.faultRate,
      relativePercentage: getRelativePercentage(dep.faultRate, faultRateSum),
      sourceHref: `#/service-details/${encodeURIComponent(dep.source)}/${encodeURIComponent(
        dep.environment
      )}`,
    }));
  }, [dependencies, searchQuery]);

  // Define table columns
  const columns: Array<EuiBasicTableColumn<DependencyFaultRateItem>> = [
    {
      field: 'target',
      name: i18nTexts.columnDependencyService,
      width: '30%',
      truncateText: true,
      render: (target: string, item: DependencyFaultRateItem) => (
        <EuiLink
          onClick={
            onDependencyClick
              ? () => onDependencyClick(item.source, target, item.sourceEnvironment)
              : undefined
          }
          style={{ cursor: onDependencyClick ? 'pointer' : 'default' }}
        >
          <EuiText size="s">
            <strong>{target}</strong>
          </EuiText>
        </EuiLink>
      ),
    },
    {
      name: i18nTexts.columnService,
      width: '30%',
      truncateText: true,
      render: (item: DependencyFaultRateItem) => (
        <ServiceCell
          service={item.source}
          environment={item.sourceEnvironment}
          href={item.sourceHref}
          onClick={
            onServiceClick ? () => onServiceClick(item.source, item.sourceEnvironment) : undefined
          }
        />
      ),
    },
    {
      name: i18nTexts.columnFaultRate,
      width: '40%',
      render: (item: DependencyFaultRateItem) => (
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
                {i18n.translate('observability.apm.faultWidgets.dependencies.error', {
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
