/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPanel,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { PromQLLineChart } from '../../shared/components/promql_line_chart';
import { navigateToExploreMetrics } from '../../shared/utils/navigation_utils';
import { INFRA_METRIC_HINTS } from '../../common/infra_constants';
import { InfraChart, InfraChartType } from '../../common/types/infra_types';
import { TimeRange } from '../../common/types/service_types';

const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
  i18n.translate(`observability.apm.serviceInfrastructure.${id}`, { defaultMessage, values });

/** Badge colours of the Explore metrics page (TYPE_COLORS). */
const TYPE_COLOR: Record<InfraChartType, string> = { counter: 'primary', gauge: 'success' };

/**
 * Mounts its children (and so runs their queries) only once scrolled near the viewport, as the
 * Explore metrics page loads only the cards on screen.
 */
const LazyMount: React.FC<React.PropsWithChildren<{ height: number }>> = ({ height, children }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [visible]);
  return visible ? <>{children}</> : <div ref={ref} style={{ height }} />;
};

export interface InfraMetricCardProps {
  chart: InfraChart;
  /** True when the service has no series for a must-have chart's metric. */
  missing?: boolean;
  timeRange: TimeRange;
  prometheusConnectionId: string;
  refreshTrigger?: number;
  onTimeRangeChange?: (from: string, to: string) => void;
}

/**
 * One chart, styled like the Explore metrics page's metric card. The title opens the chart's
 * query on the Metrics page. When the service has no series for the chart's metric, the card
 * says how to collect it instead of drawing an empty chart. Memoized: the grid re-renders on every
 * search keystroke, and an unchanged card must not redraw its chart.
 */
export const InfraMetricCard = React.memo(function InfraMetricCardInner({
  chart,
  missing,
  timeRange,
  prometheusConnectionId,
  refreshTrigger,
  onTimeRangeChange,
}: InfraMetricCardProps) {
  const header = (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
      <EuiFlexItem style={{ minWidth: 0, overflow: 'hidden' }}>
        <EuiToolTip
          content={
            <>
              <strong>{chart.metric}</strong>
              <br />
              {t('card.open', 'Open in Metrics')}
            </>
          }
        >
          <EuiButtonEmpty
            size="xs"
            style={{ maxWidth: '100%' }}
            onClick={() => navigateToExploreMetrics(chart.query, prometheusConnectionId, timeRange)}
            data-test-subj={`${chart.testSubj}Open`}
          >
            <span className="apmInfraCard__title">{chart.title}</span>
          </EuiButtonEmpty>
        </EuiToolTip>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadge color={missing ? 'default' : TYPE_COLOR[chart.type]}>
          {missing ? t('card.missingBadge', 'not collected') : chart.type}
        </EuiBadge>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
  if (missing) {
    const hint = INFRA_METRIC_HINTS[chart.metric];
    return (
      <EuiPanel
        paddingSize="none"
        hasBorder
        className="apmInfraCard apmInfraCard--missing"
        data-test-subj={`${chart.testSubj}Missing`}
      >
        {header}
        <div className="apmInfraCard__hint">
          <EuiIcon type="visLine" color="subdued" size="l" />
          <EuiText size="xs" color="subdued" textAlign="center">
            <p>
              {t('card.missing', 'No {metric} series for this service.', {
                metric: chart.metric,
              })}
              {hint && (
                <>
                  <br />
                  {t('card.collectWith', 'Collect it with')} <EuiCode>{hint.source}</EuiCode>{' '}
                  <EuiCode>{hint.detail}</EuiCode>
                </>
              )}
            </p>
          </EuiText>
        </div>
      </EuiPanel>
    );
  }
  return (
    <EuiPanel paddingSize="none" hasBorder className="apmInfraCard" data-test-subj={chart.testSubj}>
      <LazyMount height={200}>
        <PromQLLineChart
          title={chart.title}
          header={header}
          showOpenInMetrics={false}
          promqlQuery={chart.query}
          timeRange={timeRange}
          prometheusConnectionId={prometheusConnectionId}
          refreshTrigger={refreshTrigger}
          onTimeRangeChange={onTimeRangeChange}
          labelField={chart.labelField}
          formatValue={chart.format}
          formatTooltipValue={chart.format}
          height={160}
        />
      </LazyMount>
    </EuiPanel>
  );
});
