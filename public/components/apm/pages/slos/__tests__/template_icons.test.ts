/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { templateIconFor } from '../template_icons';
import type { SloSummary } from '../../../../../../common/slo/slo_types';

function makeSummary(overrides: Partial<SloSummary> = {}): SloSummary {
  return {
    id: 's',
    datasourceId: 'ds',
    datasourceType: 'prometheus',
    name: 'n',
    enabled: true,
    mode: 'active',
    service: 'svc',
    owner: { teams: ['team-a'] },
    tier: 'tier-1',
    sliNodeType: 'single',
    sliBackend: 'prometheus',
    sliLeafType: 'availability',
    objectiveCount: 1,
    worstTarget: 0.99,
    window: { type: 'rolling', duration: '28d' },
    labels: {},
    status: {
      sloId: 's',
      objectives: [],
      state: 'ok',
      firingCount: 0,
      ruleCount: 0,
      computedAt: new Date(0).toISOString(),
    },
    ...overrides,
  };
}

describe('templateIconFor', () => {
  it('maps availability SLIs to the globe icon', () => {
    expect(templateIconFor(makeSummary({ sliLeafType: 'availability' }))).toBe('globe');
  });

  it('maps latency_threshold SLIs to the clock icon', () => {
    expect(templateIconFor(makeSummary({ sliLeafType: 'latency_threshold' }))).toBe('clock');
  });

  it('maps custom SLIs to the wrench icon', () => {
    expect(templateIconFor(makeSummary({ sliLeafType: 'custom' }))).toBe('wrench');
  });

  it('maps OpenSearch-backed SLIs to the OpenSearch logo regardless of leaf type', () => {
    expect(templateIconFor(makeSummary({ sliBackend: 'opensearch', sliLeafType: 'ratio' }))).toBe(
      'logoOpenSearch'
    );
  });

  it('maps composite SLIs to visualizeApp', () => {
    expect(templateIconFor(makeSummary({ sliNodeType: 'composite' }))).toBe('visualizeApp');
  });

  it('falls back to bullseye when the shape is unknown', () => {
    expect(templateIconFor(makeSummary({ sliBackend: undefined, sliLeafType: undefined }))).toBe(
      'bullseye'
    );
  });
});
