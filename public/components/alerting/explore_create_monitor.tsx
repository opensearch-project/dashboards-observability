/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Self-contained host for the Create Monitor flyout when launched from
 * Explore's Query Panel "Actions" menu. Owns the datasource list, mutations,
 * and name-dedupe state that `alarms_page.tsx` provides when the flyout is
 * opened from the Rules page — the entry-point gives us only the PPL query
 * + dataset context, so we hydrate everything else here.
 *
 * Pre-population: we map Explore's `dataset` shape onto our `OpenSearchFormState`
 * partial — `datasourceId` (matched by mdsId/name), `indices`, `timeField`,
 * and the in-editor PPL string. Anything we can't resolve falls back to the
 * form's defaults so the user still sees a working flyout.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutHeader,
  EuiLoadingSpinner,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { CreateMonitor, MonitorFormState } from './create_monitor';
import {
  createDefaultPplTrigger,
  DEFAULT_OS_FORM,
  OpenSearchFormState,
} from './create_monitor/create_monitor_types';
import { useDatasources } from './hooks/use_datasources';
import { useMonitorMutations } from './hooks/use_monitor_mutations';
import { useRulesData } from './hooks/use_rules_data';
import { useToast } from '../common/toast';
import { transformPplFormToPayload } from '../../../common/services/alerting/form_transforms';
import { Datasource } from '../../../common/types/alerting';
import { showMonitorCreatedToast } from './toast_helpers';

export interface ExploreCreateMonitorProps {
  /** Explore-provided dataset/query context — see `QueryPanelActionDependencies`. */
  exploreContext: {
    /** Datasource saved-object id (MDS) from `dataset.dataSource.id`, or undefined for local cluster. */
    dataSourceId?: string;
    /** Datasource display name from `dataset.dataSource.title`/`name` — fallback for matching. */
    dataSourceName?: string;
    /** Index pattern title — pre-filled into the indices picker. */
    indexPattern?: string;
    /** `dataset.timeFieldName` — pre-filled into the time field picker. */
    timeFieldName?: string;
    /** PPL string the user has in the Explore editor. */
    queryInEditor: string;
  };
  onClose: () => void;
}

// Resolve the alerting catalog's local Datasource.id from Explore's dataset
// hints. Matching is staged most-specific-first:
//   1. `dataSourceId` matches our `mdsId` — exact, stable, federated case
//   2. `dataSourceId` matches our row `id` directly — non-MDS deployments
//   3. Name match (normalized — case + underscore/dash/space tolerant)
//   4. `dataSourceId` empty AND we have a no-mdsId local row — non-MDS local
//   5. Single-OS-row fallback — the catalog is unambiguous, just pick it.
//      Covers the common "I only have one cluster" case where Explore's
//      dataset hints don't survive the round-trip cleanly.
// Returns undefined only when there are zero or multiple unmatched rows.
const normalizeName = (s: string): string =>
  s
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]+/g, '');

export function resolveAlertingDatasourceId(
  datasources: Datasource[],
  hints: { dataSourceId?: string; dataSourceName?: string }
): string | undefined {
  const { dataSourceId, dataSourceName } = hints;
  const osRows = datasources.filter((d) => d.type === 'opensearch');

  if (dataSourceId) {
    const byMds = osRows.find((d) => d.mdsId === dataSourceId);
    if (byMds) return byMds.id;
    const byId = osRows.find((d) => d.id === dataSourceId);
    if (byId) return byId.id;
  }

  if (dataSourceName) {
    const target = normalizeName(dataSourceName);
    const byName = osRows.find((d) => normalizeName(d.name) === target);
    if (byName) return byName.id;
  }

  if (!dataSourceId) {
    const localRow = osRows.find((d) => !d.mdsId);
    if (localRow) return localRow.id;
  }

  if (osRows.length === 1) return osRows[0].id;

  return undefined;
}

export const ExploreCreateMonitor: React.FC<ExploreCreateMonitorProps> = ({
  exploreContext,
  onClose,
}) => {
  const { datasources, isLoading: datasourcesLoading } = useDatasources();
  const mutations = useMonitorMutations();
  const { setToast } = useToast();

  // Pin the rules-data hook to the resolved datasource so the dupe-name
  // check has the right scope. When unresolved, pass an empty array and
  // the check naturally short-circuits.
  const initialDsId = useMemo(
    () =>
      resolveAlertingDatasourceId(datasources, {
        dataSourceId: exploreContext.dataSourceId,
        dataSourceName: exploreContext.dataSourceName,
      }),
    [datasources, exploreContext]
  );

  const selectedDsIds = useMemo(() => (initialDsId ? [initialDsId] : []), [initialDsId]);
  const { rules } = useRulesData({ selectedDsIds });

  const [pplSubmitError, setPplSubmitError] = useState<string | null>(null);

  // Build the partial OpenSearchFormState seed from Explore's hints. The
  // Rules-page default trigger (`number_of_results >= 1`) is the correct
  // default for an Explore-launched query too — alert when the user's
  // filter matches any row. Reusing `createDefaultPplTrigger()` keeps the
  // two surfaces in lock-step.
  const initialForm: OpenSearchFormState = useMemo(() => {
    const indices = exploreContext.indexPattern ? [exploreContext.indexPattern] : [];
    return {
      ...DEFAULT_OS_FORM,
      datasourceId: initialDsId ?? '',
      indices,
      timeField: exploreContext.timeFieldName ?? '',
      query: exploreContext.queryInEditor || '',
      pplTriggers: [createDefaultPplTrigger()],
    };
  }, [
    initialDsId,
    exploreContext.indexPattern,
    exploreContext.timeFieldName,
    exploreContext.queryInEditor,
  ]);

  const isNameTaken = useCallback(
    (name: string, dsId: string) => {
      const trimmed = name.trim().toLowerCase();
      return rules.some((r) => r.datasourceId === dsId && r.name.trim().toLowerCase() === trimmed);
    },
    [rules]
  );

  const buildPayload = (form: MonitorFormState): Record<string, unknown> => {
    if (form.datasourceType === 'opensearch') {
      const os = form as OpenSearchFormState;
      return transformPplFormToPayload({
        name: os.name,
        enabled: os.enabled,
        query: os.query,
        schedule: os.schedule,
        pplTriggers: os.pplTriggers,
      });
    }
    // Explore-launched flyout is OS-only; this branch is unreachable in
    // practice (we force `initialBackendType='opensearch'`).
    return (form as unknown) as Record<string, unknown>;
  };

  const handleSave = async (formState: MonitorFormState) => {
    const dsId = formState.datasourceId;
    if (!dsId) {
      setToast(
        i18n.translate('observability.alerting.exploreCreateMonitor.toast.selectDatasource', {
          defaultMessage: 'Select a datasource before creating an alert rule',
        }),
        'warning'
      );
      return;
    }
    try {
      await mutations.createMonitor(buildPayload(formState), dsId);
      showMonitorCreatedToast({ monitorName: formState.name, dsId });
      setPplSubmitError(null);
      onClose();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      // PPL parse errors come back as "PPL Query validation failed: ..."; surface
      // them inline under the editor so the user can fix without losing context.
      const match = message.match(/PPL Query validation failed:[^"}]+/i);
      if (match) setPplSubmitError(match[0]);
      setToast(
        i18n.translate('observability.alerting.exploreCreateMonitor.toast.createFailed', {
          defaultMessage: 'Failed to create alert rule',
        }),
        'danger',
        message
      );
    }
  };

  // <CreateMonitor> snapshots `initialForm` into local state on mount and
  // never re-syncs — if we mounted it with `datasources: []` we'd lock in
  // an empty datasourceId even after the resolver finds a match on the next
  // render. Render a loading shell instead until the catalog arrives, so the
  // user sees the flyout open immediately rather than getting a blank flash.
  if (datasourcesLoading) {
    return (
      <EuiFlyout
        onClose={onClose}
        size="l"
        ownFocus
        aria-labelledby="exploreCreateMonitorLoadingTitle"
      >
        <EuiFlyoutHeader hasBorder>
          <EuiTitle size="m">
            <h2 id="exploreCreateMonitorLoadingTitle">
              {i18n.translate('observability.alerting.exploreCreateMonitor.loadingTitle', {
                defaultMessage: 'Create logs rule',
              })}
            </h2>
          </EuiTitle>
        </EuiFlyoutHeader>
        <EuiFlyoutBody>
          <EuiFlexGroup
            alignItems="center"
            justifyContent="center"
            gutterSize="s"
            style={{ marginTop: 80 }}
          >
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="l" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                {i18n.translate('observability.alerting.exploreCreateMonitor.loadingText', {
                  defaultMessage: 'Loading datasources…',
                })}
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlyoutBody>
      </EuiFlyout>
    );
  }

  return (
    <CreateMonitor
      onSave={handleSave}
      onCancel={onClose}
      datasources={datasources}
      selectedDsIds={selectedDsIds}
      initialBackendType="opensearch"
      initialForm={initialForm}
      isNameTaken={isNameTaken}
      submitError={pplSubmitError ? { pplMessage: pplSubmitError } : undefined}
      onClearPplSubmitError={() => setPplSubmitError(null)}
      // Launched from the Logs page itself — the "Build query in logs →"
      // link would be a circular round-trip and lose the user's unsaved
      // form state.
      hideBuildInLogsLink
    />
  );
};
