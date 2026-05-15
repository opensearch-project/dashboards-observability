/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Burn-rate tier presets surfaced in the Advanced section. Three options
 * progressively trade page urgency for ticket cadence:
 *
 *   balanced     — Google SRE Workbook Ch.5 (matches DEFAULT_MWMBR_TIERS)
 *   page-heavy   — immediate critical paging only; drops warning tiers
 *   ticket-heavy — warning cadence only; drops immediate paging
 *
 * `isPresetApplied` compares deep-equal against the live state so the UI
 * can highlight the matching button (or none, meaning the user has a
 * custom configuration).
 */

import type { BurnRateConfig } from '../../../../../common/slo/slo_types';

export type BurnRatePresetId = 'balanced' | 'page-heavy' | 'ticket-heavy';

export interface BurnRatePreset {
  id: BurnRatePresetId;
  label: string;
  summary: string;
  tiers: BurnRateConfig[];
}

const balancedTiers: BurnRateConfig[] = [
  {
    shortWindow: '5m',
    longWindow: '1h',
    burnRateMultiplier: 14.4,
    severity: 'critical',
    createAlarm: true,
    forDuration: '2m',
  },
  {
    shortWindow: '30m',
    longWindow: '6h',
    burnRateMultiplier: 6,
    severity: 'critical',
    createAlarm: true,
    forDuration: '5m',
  },
  {
    shortWindow: '2h',
    longWindow: '1d',
    burnRateMultiplier: 3,
    severity: 'warning',
    createAlarm: true,
    forDuration: '10m',
  },
  {
    shortWindow: '6h',
    longWindow: '3d',
    burnRateMultiplier: 1,
    severity: 'warning',
    createAlarm: true,
    forDuration: '30m',
  },
];

const pageHeavyTiers: BurnRateConfig[] = [
  {
    shortWindow: '2m',
    longWindow: '30m',
    burnRateMultiplier: 28.8,
    severity: 'critical',
    createAlarm: true,
    forDuration: '1m',
  },
  {
    shortWindow: '5m',
    longWindow: '1h',
    burnRateMultiplier: 14.4,
    severity: 'critical',
    createAlarm: true,
    forDuration: '2m',
  },
  {
    shortWindow: '30m',
    longWindow: '6h',
    burnRateMultiplier: 6,
    severity: 'critical',
    createAlarm: true,
    forDuration: '5m',
  },
];

const ticketHeavyTiers: BurnRateConfig[] = [
  {
    shortWindow: '2h',
    longWindow: '1d',
    burnRateMultiplier: 3,
    severity: 'warning',
    createAlarm: true,
    forDuration: '10m',
  },
  {
    shortWindow: '6h',
    longWindow: '3d',
    burnRateMultiplier: 1,
    severity: 'warning',
    createAlarm: true,
    forDuration: '30m',
  },
  {
    shortWindow: '1d',
    longWindow: '7d',
    burnRateMultiplier: 0.5,
    severity: 'warning',
    createAlarm: true,
    forDuration: '2h',
  },
];

export const BURN_RATE_PRESETS: readonly BurnRatePreset[] = [
  {
    id: 'page-heavy',
    label: 'Page-heavy',
    summary:
      '3 tiers, all critical. Adds an immediate 2m/30m guardrail; drops the slow warning tiers.',
    tiers: pageHeavyTiers,
  },
  {
    id: 'balanced',
    label: 'Balanced',
    summary:
      '4 tiers (2 critical + 2 warning). Matches the Google SRE Workbook table — the wizard default.',
    tiers: balancedTiers,
  },
  {
    id: 'ticket-heavy',
    label: 'Ticket-heavy',
    summary:
      '3 warning tiers, no immediate paging. Adds a slow 1d/7d ticket tier for chronic drift.',
    tiers: ticketHeavyTiers,
  },
];

export function getBurnRatePreset(id: BurnRatePresetId): BurnRatePreset {
  const found = BURN_RATE_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown burn-rate preset: ${id}`);
  return found;
}

/**
 * Deep-equal comparison against a preset's tiers, respecting order. Used by
 * the UI to render the matching preset button as `fill={true}`.
 */
export function isPresetApplied(preset: BurnRatePreset, tiers: BurnRateConfig[]): boolean {
  if (tiers.length !== preset.tiers.length) return false;
  for (let i = 0; i < tiers.length; i++) {
    const a = tiers[i];
    const b = preset.tiers[i];
    if (
      a.shortWindow !== b.shortWindow ||
      a.longWindow !== b.longWindow ||
      a.burnRateMultiplier !== b.burnRateMultiplier ||
      a.severity !== b.severity ||
      a.createAlarm !== b.createAlarm ||
      a.forDuration !== b.forDuration
    ) {
      return false;
    }
  }
  return true;
}
