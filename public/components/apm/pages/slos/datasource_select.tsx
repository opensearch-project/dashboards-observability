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
 * Type-ahead single-select: mirrors the Alert Manager index picker's
 * `EuiComboBox` UX so it scales when many datasources are registered. Unlike
 * the index picker it does NOT accept free text (`onCreateOption`) — a
 * datasource must resolve to a real saved object, and accepting arbitrary
 * strings is exactly the class of error this picker exists to prevent.
 *
 * Backend-extensibility: the filter is driven by `SUPPORTED_SLI_BACKENDS`
 * (common/slo/slo_types) mapped through `SLI_BACKEND_TO_DATASOURCE_TYPE`. When
 * OpenSearch-backed SLOs land, adding `'opensearch'` to `SUPPORTED_SLI_BACKENDS`
 * widens this dropdown automatically — no change needed here.
 */

import React, { useMemo } from 'react';
import { EuiCallOut, EuiComboBox, EuiComboBoxOptionOption, EuiLink, EuiText } from '@elastic/eui';
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

type Option = EuiComboBoxOptionOption<{ id: string }>;

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

  // Only Prometheus connections with a `directQueryName` (the SQL-plugin
  // connection id) can back an SLO: the deploy path resolves `spec.datasourceId`
  // through that id, not the OSD saved-object id. A Prometheus datasource
  // without one can't be deployed to, so it isn't an eligible option.
  const eligible = useMemo(
    () =>
      datasources.filter(
        (d) => SUPPORTED_DATASOURCE_TYPES.includes(d.type) && d.enabled && !!d.directQueryName
      ),
    [datasources]
  );

  // The option *value* is the `directQueryName` (connection id) — the
  // identifier the SLO routes resolve and persist as `spec.datasourceId`.
  // Emitting the saved-object id here is what caused "datasource is not
  // registered" at create time even though preview accepted it.
  const options: Option[] = useMemo(
    () => eligible.map((ds) => ({ label: ds.name, value: { id: ds.directQueryName! } })),
    [eligible]
  );

  // Resolve the selected connection id back to its option so the combobox shows
  // the datasource name (not the raw id) as the active chip.
  const selectedOptions: Option[] = useMemo(() => {
    if (!value) return [];
    const match = options.find((o) => o.value?.id === value);
    return match ? [match] : [];
  }, [options, value]);

  // Empty state takes precedence over loading once the list resolves: a
  // never-loaded list and a loaded-but-empty list both render the same
  // actionable callout rather than a perpetual spinner.
  if (!isLoading && eligible.length === 0) {
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

  const handleChange = (next: Option[]) => {
    // singleSelection caps `next` at one entry; empty means the user cleared it.
    onChange(next[0]?.value?.id ?? '');
  };

  return (
    <EuiComboBox
      singleSelection={{ asPlainText: true }}
      isClearable
      isLoading={isLoading}
      isInvalid={isInvalid}
      placeholder={i18n.translate('observability.apm.slo.wizard.datasource.placeholder', {
        defaultMessage: 'Select a datasource',
      })}
      options={options}
      selectedOptions={selectedOptions}
      onChange={handleChange}
      data-test-subj="slosWizardDatasourceId"
      aria-label={i18n.translate('observability.apm.slo.wizard.datasource.ariaLabel', {
        defaultMessage: 'Datasource for this SLO',
      })}
    />
  );
};
