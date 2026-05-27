/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Derive a listing-shaped projection so we can reuse `templateIconFor` for
 * Suggest page rows. No template id is persisted on a `Suggestion`; the
 * projection only needs sliBackend + sliLeafType.
 */

import type { SloSummary } from '../../../../../common/slo/slo_types';
import { templateIconFor } from './template_icons';
import type { Suggestion } from './suggest_engine';

export function suggestionIconType(s: Suggestion): string {
  const sli = s.input.spec.sli;
  const sliBackend = sli.type === 'single' ? sli.definition.backend : undefined;
  const sliLeafType =
    sli.type === 'single' ? (sli.definition as { type?: string }).type ?? undefined : undefined;
  const projection = {
    sliNodeType: sli.type === 'single' ? 'single' : 'composite',
    sliBackend,
    sliLeafType,
  } as Partial<SloSummary>;
  return templateIconFor(projection as SloSummary);
}
