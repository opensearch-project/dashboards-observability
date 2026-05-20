/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * W4.8 — Read-only spec preview for the Recover/Clone row-expansion. Mirrors
 * the wizard's spec summary but lives in its own component so it can be
 * embedded as an expanded-row renderer without pulling in the full wizard.
 */

import React from 'react';
import {
  EuiBadge,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { SloSpec } from '../../../../../../common/slo/slo_types';

export interface ReadOnlySpecPreviewProps {
  spec: SloSpec;
  /** Fingerprints from the orphan candidate — used to list expected recording-rule names. */
  fingerprints?: string[];
}

const MAX_OBJECTIVES_SHOWN = 3;

function dimensionSummary(spec: SloSpec): string {
  if (spec.sli.type !== 'single') return '—';
  const dims = spec.sli.dimensions ?? [];
  if (dims.length === 0) return '—';
  return dims.map((d) => `${d.name}=${d.value}`).join(', ');
}

function sliSummary(
  spec: SloSpec
): {
  backend: string;
  type: string;
  metric: string;
} {
  if (spec.sli.type !== 'single') {
    return { backend: 'composite', type: spec.sli.type, metric: '—' };
  }
  const def = spec.sli.definition;
  if (def.backend === 'prometheus') {
    return {
      backend: 'prometheus',
      type: def.type,
      metric: def.metric ?? (def.type === 'custom' ? '(custom PromQL)' : '—'),
    };
  }
  return { backend: 'opensearch', type: def.type, metric: def.index ?? '—' };
}

export const ReadOnlySpecPreview: React.FC<ReadOnlySpecPreviewProps> = ({
  spec,
  fingerprints = [],
}) => {
  const sli = sliSummary(spec);
  const objectivesShown = spec.objectives.slice(0, MAX_OBJECTIVES_SHOWN);
  const overflow = spec.objectives.length - objectivesShown.length;

  return (
    <div data-test-subj="sloAdoption-readOnlySpecPreview">
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiTitle size="xs">
            <h4>{spec.name}</h4>
          </EuiTitle>
          <EuiText size="s" color="subdued">
            {spec.description || 'No description'}
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">Service: {spec.service}</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">
            Owner: {spec.owner.teams.length > 0 ? spec.owner.teams.join(', ') : '—'}
          </EuiBadge>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="s" />

      <EuiDescriptionList
        type="column"
        compressed
        listItems={[
          { title: 'SLI backend', description: sli.backend },
          { title: 'SLI type', description: sli.type },
          { title: 'Metric / index', description: sli.metric },
          { title: 'Dimensions', description: dimensionSummary(spec) },
          { title: 'Mode', description: spec.mode },
        ]}
      />

      <EuiSpacer size="s" />
      <EuiTitle size="xxs">
        <h5>Objectives</h5>
      </EuiTitle>
      <EuiText size="s" data-test-subj="sloAdoption-readOnlySpecPreview-objectives">
        {objectivesShown.map((o, i) => (
          <div key={i}>
            <strong>{o.displayName || o.name || `objective-${i + 1}`}</strong> — target{' '}
            {(o.target * 100).toFixed(o.target >= 0.999 ? 2 : 1)}%
          </div>
        ))}
        {overflow > 0 ? (
          <EuiBadge
            color="hollow"
            data-test-subj="sloAdoption-readOnlySpecPreview-objectivesOverflow"
          >
            +{overflow} more
          </EuiBadge>
        ) : null}
      </EuiText>

      <EuiSpacer size="s" />
      <EuiTitle size="xxs">
        <h5>Expected recording groups</h5>
      </EuiTitle>
      {fingerprints.length === 0 ? (
        <EuiText size="s" color="subdued">
          No fingerprints reported.
        </EuiText>
      ) : (
        <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
          {fingerprints.map((fp) => (
            <EuiFlexItem grow={false} key={fp}>
              <EuiBadge color="hollow">slo:rec:{fp}</EuiBadge>
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      )}
    </div>
  );
};
