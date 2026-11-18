/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem, EuiToolTip } from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../../framework/core_refs';
import type {
  ExploreQueryTarget,
  ExploreSignal,
  ExploreTimeRange,
} from '../../../../common/types/explore_links';
import { buildExploreNavigation, isExploreQueryTarget } from './explore_url';

/** Whether Explore links are on for this request (`observability.exploreLinks.enabled`). */
export function isExploreLinksEnabled(): boolean {
  const caps = coreRefs.application?.capabilities as
    { observability?: { exploreLinksEnabled?: boolean } } | undefined;
  return caps?.observability?.exploreLinksEnabled === true;
}

interface DatasetTypeMeta {
  meta?: { requiresExplicitRun?: boolean };
}

function datasetType(type: string): DatasetTypeMeta | undefined {
  const service = (
    coreRefs.data as
      | {
          query?: {
            queryString?: { getDatasetService?: () => { getType?: (t: string) => unknown } };
          };
        }
      | undefined
  )?.query?.queryString?.getDatasetService?.();
  return service?.getType?.(type) as DatasetTypeMeta | undefined;
}

/**
 * The targets this browser can open: well-formed, and their dataset type is registered here
 * (a type another plugin registers only when its own feature is on stays hidden otherwise, so a
 * link never lands on a page that can't run it).
 */
export function openableExploreTargets(
  targets: ExploreQueryTarget[] | undefined
): ExploreQueryTarget[] {
  if (!targets || targets.length === 0 || !isExploreLinksEnabled()) return [];
  return targets.filter((t) => isExploreQueryTarget(t) && !!datasetType(t.dataset.type));
}

const OPEN_LABEL: Record<ExploreSignal, string> = {
  logs: i18n.translate('observability.exploreLinks.openInLogs', { defaultMessage: 'Open in Logs' }),
  metrics: i18n.translate('observability.exploreLinks.openInMetrics', {
    defaultMessage: 'Open in Metrics',
  }),
  traces: i18n.translate('observability.exploreLinks.openInTraces', {
    defaultMessage: 'Open in Traces',
  }),
};

const EXPLICIT_RUN_HINT = i18n.translate('observability.exploreLinks.explicitRunHint', {
  defaultMessage:
    'Opens the query ready to run. This data source runs queries only when you start them.',
});

export interface ExploreLinkButtonsProps {
  targets: ExploreQueryTarget[] | undefined;
  timeRange: ExploreTimeRange;
  /** Called before navigating (e.g. to close a flyout). */
  onNavigate?: () => void;
  'data-test-subj'?: string;
}

/**
 * One button per openable target ("Open in Metrics", "Open in Logs"). Renders nothing when
 * Explore links are off or no target can be opened, so callers can place it unconditionally.
 */
export const ExploreLinkButtons: React.FC<ExploreLinkButtonsProps> = ({
  targets,
  timeRange,
  onNavigate,
  'data-test-subj': dataTestSubj = 'exploreLinkButtons',
}) => {
  const openable = openableExploreTargets(targets);
  if (openable.length === 0) return null;
  const labelled = openable.length > 1;
  return (
    <EuiFlexGroup gutterSize="xs" responsive={false} wrap data-test-subj={dataTestSubj}>
      {openable.map((target, i) => {
        const { appId, path } = buildExploreNavigation(target, timeRange);
        const href = coreRefs.application?.getUrlForApp?.(appId, { path });
        const base = OPEN_LABEL[target.signal];
        const text = labelled && target.label ? `${base}: ${target.label}` : base;
        const onClick = (e: React.MouseEvent) => {
          // Let modified clicks (new tab / window) follow the href.
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          onNavigate?.();
          coreRefs.application?.navigateToApp(appId, { path });
        };
        const button = (
          // href keeps "open in new tab"; onClick navigates in-app (workspace-aware).
          // eslint-disable-next-line @elastic/eui/href-or-on-click
          <EuiButtonEmpty
            size="s"
            iconType="discoverApp"
            href={href}
            onClick={onClick}
            data-test-subj={`${dataTestSubj}-${i}`}
          >
            {text}
          </EuiButtonEmpty>
        );
        const explicitRun = datasetType(target.dataset.type)?.meta?.requiresExplicitRun === true;
        return (
          <EuiFlexItem grow={false} key={`${appId}-${i}`}>
            {explicitRun ? <EuiToolTip content={EXPLICIT_RUN_HINT}>{button}</EuiToolTip> : button}
          </EuiFlexItem>
        );
      })}
    </EuiFlexGroup>
  );
};
