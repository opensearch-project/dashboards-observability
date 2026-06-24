/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Datasource picker for the SLO wizard.
 *
 * Replaces the free-text datasource-id field: the user has to know a stable
 * saved-object id otherwise, and an invalid (or non-supported-backend)
 * datasource only fails at Create time. This component sources the real list
 * via `useDatasources()` — the same hook Alert Manager's monitor creation uses
 * — and filters it to the backends SLOs can currently be created against.
 *
 * Backend-extensibility: the filter is driven by `SUPPORTED_SLI_BACKENDS`
 * (common/slo/slo_types) mapped through `SLI_BACKEND_TO_DATASOURCE_TYPE`. When
 * OpenSearch-backed SLOs land, adding `'opensearch'` to `SUPPORTED_SLI_BACKENDS`
 * widens this dropdown automatically — no change needed here.
 */

import React, { useMemo } from 'react';
import { EuiCallOut, EuiLink, EuiLoadingSpinner, EuiSelect, EuiText } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import type { Datasource, DatasourceType } from '../../../../../common/types/alerting';
import type { SliBackend } from '../../../../../common/slo/slo_types';
import { SUPPORTED_SLI_BACKENDS } from '../../../../../common/slo/slo_types';
import { useDatasources } from '../../../alerting/hooks/use_datasources';
import { coreRefs } from '../../../../framework/core_refs';

/**
 * Map an SLI backend to the `Datasource.type` that can serve it. Kept explicit
 * (rather than assuming the names match) so the two type spaces can evolve
 * independently — e.g. a future backend served by an existing datasource type.
 */
const SLI_BACKEND_TO_DATASOURCE_TYPE: Record<SliBackend, DatasourceType> = {
  prometheus: 'prometheus',
  opensearch: 'opensearch',
};

/** Datasource types that can back a currently-supported SLO. */
export const SUPPORTED_DATASOURCE_TYPES: readonly DatasourceType[] = SUPPORTED_SLI_BACKENDS.map(
  (b) => SLI_BACKEND_TO_DATASOURCE_TYPE[b]
);

export interface DatasourceSelectProps {
  /** Currently-selected datasource saved-object id (empty string when unset). */
  value: string;
  onChange: (datasourceId: string) => void;
  isInvalid?: boolean;
  /**
   * Optional override of the datasource list — primarily for tests. When
   * omitted the component reads the live list via `useDatasources()`.
   */
  datasources?: Datasource[];
  /** Optional loading override paired with `datasources` for tests. */
  isLoading?: boolean;
}

export const DatasourceSelect: React.FC<DatasourceSelectProps> = ({
  value,
  onChange,
  isInvalid,
  datasources: datasourcesProp,
  isLoading: isLoadingProp,
}) => {
  const hook = useDatasources();
  const datasources = datasourcesProp ?? hook.datasources;
  const isLoading = isLoadingProp ?? hook.isLoading;

  const eligible = useMemo(
    () => datasources.filter((d) => SUPPORTED_DATASOURCE_TYPES.includes(d.type) && d.enabled),
    [datasources]
  );

  if (isLoading) {
    return (
      <EuiText size="s" color="subdued" data-test-subj="slosWizardDatasourceLoading">
        <EuiLoadingSpinner size="s" />{' '}
        {i18n.translate('observability.apm.slo.wizard.datasource.loading', {
          defaultMessage: 'Loading datasources…',
        })}
      </EuiText>
    );
  }

  if (eligible.length === 0) {
    return (
      <EuiCallOut
        size="s"
        color="warning"
        iconType="alert"
        title={i18n.translate('observability.apm.slo.wizard.datasource.emptyTitle', {
          defaultMessage: 'No compatible datasources',
        })}
        data-test-subj="slosWizardDatasourceEmpty"
      >
        <EuiText size="s">
          {i18n.translate('observability.apm.slo.wizard.datasource.emptyBody', {
            defaultMessage:
              'SLOs deploy as Prometheus rules, so they need a DirectQuery Prometheus connection. Add one in Data sources, then return here.',
          })}{' '}
          <EuiLink
            onClick={() =>
              coreRefs?.application?.navigateToApp('management', {
                path: 'opensearch-dashboards/dataSources',
              })
            }
            data-test-subj="slosWizardDatasourceEmptyLink"
          >
            {i18n.translate('observability.apm.slo.wizard.datasource.emptyLink', {
              defaultMessage: 'Manage data sources',
            })}
          </EuiLink>
        </EuiText>
      </EuiCallOut>
    );
  }

  // Placeholder row forces an explicit pick rather than silently defaulting to
  // the first datasource — keeps the validation error meaningful on first open.
  const options = [
    {
      value: '',
      text: i18n.translate('observability.apm.slo.wizard.datasource.placeholder', {
        defaultMessage: 'Select a datasource',
      }),
      disabled: true,
    },
    ...eligible.map((ds) => ({ value: ds.id, text: ds.name })),
  ];

  return (
    <EuiSelect
      options={options}
      value={value}
      isInvalid={isInvalid}
      onChange={(e) => onChange(e.target.value)}
      data-test-subj="slosWizardDatasourceId"
    />
  );
};
