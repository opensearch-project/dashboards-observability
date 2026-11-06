/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiBadge,
  EuiBasicTableColumn,
  EuiButtonEmpty,
  EuiHealth,
  EuiInMemoryTable,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiTextColor,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { INFRA_POD_PHASE } from '../../common/infra_constants';
import { InfraPodRow } from '../../common/types/infra_types';
import { podKey } from '../../query_services/query_requests/infra_queries';
import { formatBytes, formatCores } from './infra_format';

const t = (id: string, defaultMessage: string, values?: Record<string, string | number>) =>
  i18n.translate(`observability.apm.serviceInfrastructure.${id}`, { defaultMessage, values });

/** Share of the limit, with the colour the Explore metrics page uses for thresholds. */
const usageColor = (pct: number) => (pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success');

/** A usage value with a bar against its limit (as Datadog's pod table shows it). */
const UsageCell: React.FC<{ text: string; used?: number; limit?: number }> = ({
  text,
  used,
  limit,
}) => {
  const pct = used !== undefined && limit ? Math.round((used / limit) * 100) : undefined;
  return (
    <div style={{ width: '100%' }}>
      <EuiText size="s">
        {text}
        {pct !== undefined && (
          <EuiTextColor color="subdued">
            <small>{` ${pct}%`}</small>
          </EuiTextColor>
        )}
      </EuiText>
      {pct !== undefined && (
        <EuiProgress value={Math.min(pct, 100)} max={100} size="xs" color={usageColor(pct)} />
      )}
    </div>
  );
};

const podColumns: Array<EuiBasicTableColumn<InfraPodRow>> = [
  { field: 'pod', name: t('pods.pod', 'Pod'), sortable: true, truncateText: true },
  { field: 'node', name: t('pods.node', 'Node'), sortable: true, truncateText: true },
  {
    field: 'phase',
    name: t('pods.phase', 'Phase'),
    render: (phase: number | undefined, row: InfraPodRow) => {
      if (row.replaced) {
        return <EuiHealth color="subdued">{t('pods.replaced', 'Replaced')}</EuiHealth>;
      }
      const p = phase !== undefined ? INFRA_POD_PHASE[phase] : undefined;
      return p ? <EuiHealth color={p.color}>{p.label}</EuiHealth> : '-';
    },
  },
  {
    field: 'cpu',
    name: t('pods.cpu', 'CPU (of limit)'),
    sortable: true,
    render: (cpu: number | undefined, row: InfraPodRow) => (
      <UsageCell text={formatCores(cpu)} used={cpu} limit={row.cpuLimit} />
    ),
  },
  {
    field: 'memory',
    name: t('pods.memory', 'Memory (of limit)'),
    sortable: true,
    render: (mem: number | undefined, row: InfraPodRow) => (
      <UsageCell text={formatBytes(mem)} used={mem} limit={row.memoryLimit} />
    ),
  },
  {
    field: 'restarts',
    name: t('pods.restarts', 'Restarts (total)'),
    sortable: true,
    render: (r?: number) =>
      r === undefined ? '-' : r > 0 ? <EuiBadge color="warning">{r}</EuiBadge> : r,
  },
];

export interface InfraPodTableProps {
  /** The pods to show (after the label filters and the replaced toggle). */
  pods: InfraPodRow[];
  /** Pods listed in total (present, plus replaced when shown). */
  listed: number;
  /** Pods loaded (present and replaced), at most INFRA_MAX_PODS. */
  loaded: number;
  /** Pods found in the range before the INFRA_MAX_PODS cap. */
  totalPods: number;
  replacedCount: number;
  showReplaced: boolean;
  onToggleReplaced: () => void;
}

/** The pod table: pods present at the range end, with replaced ones behind a toggle. */
export const InfraPodTable: React.FC<InfraPodTableProps> = ({
  pods,
  listed,
  loaded,
  totalPods,
  replacedCount,
  showReplaced,
  onToggleReplaced,
}) => (
  <EuiPanel hasBorder>
    <EuiTitle size="xs">
      <h3>{t('pods.title', 'Pods ({shown} of {total})', { shown: pods.length, total: listed })}</h3>
    </EuiTitle>
    {totalPods > loaded && (
      <EuiText size="xs" color="subdued" data-test-subj="serviceInfrastructurePodsCapped">
        {t(
          'pods.capped',
          'Showing {loaded} of {total} pods found in this range (pods present at its end first).',
          { loaded, total: totalPods }
        )}
      </EuiText>
    )}
    {replacedCount > 0 && (
      <EuiButtonEmpty
        size="xs"
        flush="left"
        onClick={onToggleReplaced}
        data-test-subj="serviceInfrastructureShowReplaced"
      >
        {showReplaced
          ? t('pods.hideReplaced', 'Hide replaced pods')
          : t('pods.showReplaced', 'Show {n} pods replaced in this range', { n: replacedCount })}
      </EuiButtonEmpty>
    )}
    <EuiSpacer size="s" />
    <EuiInMemoryTable
      items={pods}
      itemId={(p: InfraPodRow) => podKey(p)}
      columns={podColumns}
      sorting={{ sort: { field: 'cpu', direction: 'desc' } }}
      pagination={{ initialPageSize: 10, pageSizeOptions: [10, 25, 50] }}
      tableLayout="auto"
      data-test-subj="serviceInfrastructurePods"
    />
  </EuiPanel>
);
