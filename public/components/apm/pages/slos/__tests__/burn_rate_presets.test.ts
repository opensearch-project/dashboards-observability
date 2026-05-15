/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { BURN_RATE_PRESETS, getBurnRatePreset, isPresetApplied } from '../burn_rate_presets';

describe('burn-rate presets', () => {
  it('exposes the documented three presets', () => {
    expect(BURN_RATE_PRESETS.map((p) => p.id).sort()).toEqual(
      ['balanced', 'page-heavy', 'ticket-heavy'].sort()
    );
  });

  it('each preset has at least one tier', () => {
    for (const p of BURN_RATE_PRESETS) {
      expect(p.tiers.length).toBeGreaterThan(0);
    }
  });

  it('isPresetApplied returns true on a freshly cloned preset', () => {
    const p = getBurnRatePreset('balanced');
    expect(
      isPresetApplied(
        p,
        p.tiers.map((t) => ({ ...t }))
      )
    ).toBe(true);
  });

  it('isPresetApplied returns false when the user edits any field', () => {
    const p = getBurnRatePreset('balanced');
    const tiers = p.tiers.map((t) => ({ ...t }));
    tiers[0].burnRateMultiplier = tiers[0].burnRateMultiplier + 0.1;
    expect(isPresetApplied(p, tiers)).toBe(false);
  });

  it('isPresetApplied returns false when the user adds a tier', () => {
    const p = getBurnRatePreset('balanced');
    const tiers = p.tiers.map((t) => ({ ...t }));
    tiers.push({ ...tiers[0] });
    expect(isPresetApplied(p, tiers)).toBe(false);
  });

  it('getBurnRatePreset throws on an unknown id', () => {
    // Cast to bypass the union — the runtime guard is the point of the test.
    expect(() => getBurnRatePreset('made-up' as 'balanced')).toThrow(/Unknown burn-rate preset/);
  });
});
