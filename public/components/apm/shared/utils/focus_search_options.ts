/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

export interface FocusOption {
  label: string;
  value: string;
  key: string;
}
export interface FocusOptionGroup {
  label: string;
  options: FocusOption[];
}

/** 0 exact, 1 starts with, 2 contains, -1 no match (case-insensitive). */
const rank = (label: string, search: string): number => {
  const l = label.toLowerCase();
  if (l === search) return 0;
  if (l.startsWith(search)) return 1;
  return l.includes(search) ? 2 : -1;
};

/**
 * The "Focus on" options matching a search, still grouped by environment: within an
 * environment the best matches first (exact, then starts with, then contains), and the
 * environments ordered by their best match, so "svc-012" is not buried under "load-svc-0120"
 * in a long list. Environments with no match are left out; no search lists everything.
 */
export function filterFocusOptions(
  groups: FocusOptionGroup[],
  searchValue: string
): FocusOptionGroup[] {
  const search = searchValue.trim().toLowerCase();
  if (!search) return groups;
  return groups
    .map((group) => {
      const ranked = group.options
        .map((option) => ({ option, r: rank(option.label, search) }))
        .filter((m) => m.r >= 0)
        .sort((a, b) => a.r - b.r || a.option.label.localeCompare(b.option.label));
      return { group, best: ranked[0]?.r ?? -1, options: ranked.map((m) => m.option) };
    })
    .filter((g) => g.options.length > 0)
    .sort((a, b) => a.best - b.best || a.group.label.localeCompare(b.group.label))
    .map((g) => ({ ...g.group, options: g.options }));
}
