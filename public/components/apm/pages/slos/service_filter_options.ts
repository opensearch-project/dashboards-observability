/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Shared option-list builder for the two service-picker popovers (Suggest SLOs
 * page filter + Services Home suggest CTA). Keeping one implementation means
 * both pickers agree on how covered/checked services render and sort.
 */

export interface ServiceFilterOption {
  label: string;
  checked?: 'on';
  disabled: boolean;
  covered: boolean;
}

/**
 * Build the service-filter option list: fully-covered services are disabled
 * (they already own their canonical pair), selected services are checked, and
 * checked services float to the top so the current selection is visible at a
 * glance. Each partition keeps the original service order. Pure so the sort +
 * checked/covered logic is unit-testable without EUI's virtualized list.
 */
export function buildServiceFilterOptions(
  serviceNames: string[],
  selectedSet: Set<string>,
  coveredSet: Set<string>
): ServiceFilterOption[] {
  return serviceNames
    .map((label, idx) => {
      const covered = coveredSet.has(label);
      return {
        label,
        checked: !covered && selectedSet.has(label) ? ('on' as const) : undefined,
        disabled: covered,
        covered,
        idx,
      };
    })
    .sort((a, b) => {
      const aChecked = a.checked === 'on' ? 0 : 1;
      const bChecked = b.checked === 'on' ? 0 : 1;
      return aChecked - bChecked || a.idx - b.idx;
    })
    .map(({ idx: _idx, ...opt }) => opt);
}
