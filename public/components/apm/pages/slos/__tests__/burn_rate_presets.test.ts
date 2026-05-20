/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_MWMBR_TIERS } from '../../../../../../common/slo/slo_promql_generator';
import { BURN_RATE_PRESETS, getBurnRatePreset, isPresetApplied } from '../burn_rate_presets';

describe('burn_rate_presets', () => {
  it('Balanced preset matches DEFAULT_MWMBR_TIERS so the wizard default reads as Balanced', () => {
    const balanced = getBurnRatePreset('balanced');
    expect(balanced.tiers.length).toBe(DEFAULT_MWMBR_TIERS.length);
    for (let i = 0; i < balanced.tiers.length; i++) {
      expect(balanced.tiers[i]).toEqual(DEFAULT_MWMBR_TIERS[i]);
    }
  });

  it('Page-heavy drops warning tiers and adds a tighter paging tier', () => {
    const pageHeavy = getBurnRatePreset('page-heavy');
    expect(pageHeavy.tiers.every((t) => t.severity === 'critical')).toBe(true);
    expect(pageHeavy.tiers[0].burnRateMultiplier).toBe(28.8);
  });

  it('Ticket-heavy adds a slow 1d/7d tier and no paging tiers', () => {
    const ticketHeavy = getBurnRatePreset('ticket-heavy');
    expect(ticketHeavy.tiers.every((t) => t.severity === 'warning')).toBe(true);
    const slowest = ticketHeavy.tiers[ticketHeavy.tiers.length - 1];
    expect(slowest.shortWindow).toBe('1d');
    expect(slowest.longWindow).toBe('7d');
  });

  it('isPresetApplied returns true for an exact tier match and false for a single-field diff', () => {
    const balanced = getBurnRatePreset('balanced');
    expect(isPresetApplied(balanced, balanced.tiers.slice())).toBe(true);
    const diverged = balanced.tiers.map((t, i) => (i === 0 ? { ...t, burnRateMultiplier: 99 } : t));
    expect(isPresetApplied(balanced, diverged)).toBe(false);
  });

  it('isPresetApplied rejects when the tier count differs', () => {
    const balanced = getBurnRatePreset('balanced');
    const shorter = balanced.tiers.slice(0, balanced.tiers.length - 1);
    expect(isPresetApplied(balanced, shorter)).toBe(false);
  });

  it('declares three presets', () => {
    expect(BURN_RATE_PRESETS.map((p) => p.id)).toEqual(['page-heavy', 'balanced', 'ticket-heavy']);
  });
});
