/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
import React from 'react';
import { EuiBadge, EuiText, EuiToolTip } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { Datasource, DatasourceType } from '../../../common/types/alerting';
import { datasourceEntryLabel, datasourceTypeLabel } from './datasource_facet';

/** The account and region a row carries (`UnifiedCloudWatchMeta`). */
export interface DatasourceTagCloudWatch {
  accountId?: string;
  region?: string;
}

export interface DatasourceTagProps {
  /** The row's datasource, when it is still listed. */
  ds?: Datasource;
  /** The CloudWatch account and region of the row (a CloudWatch alarm or alert). */
  cloudWatch?: DatasourceTagCloudWatch;
  datasourceType: DatasourceType;
  /** The tag text when `ds` is unknown (defaults to the account id, else the type). */
  fallbackLabel?: string;
  'data-test-subj'?: string;
}

export interface DatasourceTagParts {
  /** The tag: the same text as the row's Data source filter entry. */
  label: string;
  /** The line under the tag: `Cross-account · <region>`, `<region>`, or none. */
  detail?: string;
  /** Hover text: `<Type> · account <id>`, or the type alone. */
  title: string;
}

const SEPARATOR = ' · ';

/**
 * What the Data source tag shows: the data source once, as the filter
 * names it, with the region (and "Cross-account" for a connection scope) on a second line.
 */
export function datasourceTagParts({
  ds,
  cloudWatch,
  datasourceType,
  fallbackLabel,
}: Omit<DatasourceTagProps, 'data-test-subj'>): DatasourceTagParts {
  const type = ds?.type ?? datasourceType;
  const typeLabel = datasourceTypeLabel(type);
  const accountId = type === 'cloudwatch' ? (cloudWatch?.accountId ?? ds?.accountId) : undefined;
  const label = ds ? datasourceEntryLabel(ds) : (fallbackLabel ?? accountId ?? typeLabel);
  let detail: string | undefined;
  if (type === 'cloudwatch') {
    const region = cloudWatch?.region ?? ds?.region;
    // Same rule as the facet's "This account" / "Cross-account" headings.
    const cross = ds !== undefined && ds.cloudWatchScope !== undefined;
    const crossLabel = i18n.translate('observability.alerting.datasourceTag.crossAccount', {
      defaultMessage: 'Cross-account',
    });
    detail = cross ? (region ? `${crossLabel}${SEPARATOR}${region}` : crossLabel) : region;
  } else if (type === 'prometheus') {
    detail = ds?.region || undefined;
  }
  const title = accountId
    ? i18n.translate('observability.alerting.datasourceTag.titleWithAccount', {
        defaultMessage: '{type} · account {accountId}',
        values: { type: typeLabel, accountId },
      })
    : typeLabel;
  return { label, detail: detail || undefined, title };
}

/**
 * The data source of a row, shown once: an outlined tag with the source's name, then a 12px
 * subdued line with the region. Used by the Alerts and Rules tables and the flyout headers.
 */
export const DatasourceTag: React.FC<DatasourceTagProps> = ({
  'data-test-subj': dataTestSubj = 'datasourceTag',
  ...props
}) => {
  const { label, detail, title } = datasourceTagParts(props);
  return (
    <div data-test-subj={dataTestSubj} data-title={title} style={{ minWidth: 0, maxWidth: '100%' }}>
      <EuiToolTip content={title}>
        <EuiBadge color="hollow" style={{ maxWidth: '100%' }}>
          {label}
        </EuiBadge>
      </EuiToolTip>
      {detail && (
        <EuiText
          size="xs"
          color="subdued"
          className="altDatasourceTagDetail"
          style={{ fontSize: 12, lineHeight: '16px' }}
          data-test-subj={`${dataTestSubj}-detail`}
        >
          {detail}
        </EuiText>
      )}
    </div>
  );
};
