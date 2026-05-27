/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Map an SLO row to an EUI iconType. The wizard exposes dedicated icons per
 * SLI template (see SLO_TEMPLATES), but no template id is persisted on the
 * SloSummary today — the projection only carries sliBackend + sliLeafType.
 * Infer a matching icon from those two fields, defaulting to `bullseye` when
 * the shape is ambiguous.
 */

import type { SloSummary } from '../../../../../common/slo/slo_types';

const DEFAULT_ICON = 'bullseye';

export function templateIconFor(row: SloSummary): string {
  if (row.sliNodeType === 'composite') return 'visualizeApp';
  if (row.sliBackend === 'opensearch') return 'logoOpenSearch';
  switch (row.sliLeafType) {
    case 'availability':
      return 'globe';
    case 'latency_threshold':
      return 'clock';
    case 'custom':
      return 'wrench';
    default:
      return DEFAULT_ICON;
  }
}
