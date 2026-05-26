/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import type { SloDocument } from '../../../../../../common/slo/slo_types';
import { SloMetadataPanel } from '../slo_metadata_panel';

function makeSlo(overrides: Partial<SloDocument['spec']> = {}): SloDocument {
  return {
    id: 'slo-1',
    spec: {
      datasourceId: 'ds-2',
      name: 'api-availability',
      enabled: true,
      mode: 'active',
      service: 'api',
      owner: { teams: ['sre'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
        },
        dimensions: [{ name: 'service', value: 'api' }],
      },
      objectives: [{ name: 'obj-1', target: 0.99 }],
      budgetWarningThresholds: [
        { threshold: 0.5, severity: 'warning' },
        { threshold: 0.25, severity: 'critical' },
      ],
      window: { type: 'rolling', duration: '28d' },
      alerting: {
        strategy: 'mwmbr',
        burnRates: [
          {
            shortWindow: '5m',
            longWindow: '1h',
            burnRateMultiplier: 14,
            severity: 'page',
            createAlarm: true,
            forDuration: '2m',
          },
          {
            shortWindow: '30m',
            longWindow: '6h',
            burnRateMultiplier: 6,
            severity: 'page',
            createAlarm: false,
            forDuration: '15m',
          },
        ],
      },
      alarms: {
        sliHealth: { enabled: false },
        attainmentBreach: { enabled: false },
        budgetWarning: { enabled: true },
        noData: { enabled: true, forDuration: '15m' },
        resolved: { enabled: false },
      },
      exclusionWindows: [
        {
          name: 'weekly-maintenance',
          schedule: {
            type: 'cron',
            expression: '0 2 * * 0',
            duration: '2h',
            timezone: 'UTC',
          },
          reason: 'weekly release window',
        },
      ],
      labels: { team: 'sre', env: 'prod' },
      annotations: { runbook: 'https://runbooks.example/api' },
      ...overrides,
    },
    status: {
      version: 1,
      createdAt: '2026-01-01T00:00:00Z',
      createdBy: 'me',
      updatedAt: '2026-01-01T00:00:00Z',
      updatedBy: 'me',
      provisioning: {
        backend: 'prometheus',
        alertGroupName: 'slo:api-availability',
        rulerNamespace: 'slo-api-availability',
      },
    },
  };
}

describe('SloMetadataPanel', () => {
  it('shows labels with the slo_label_<key> propagation hint', () => {
    render(<SloMetadataPanel slo={makeSlo()} />);
    const badges = screen.getAllByTestId('slosDetailMetadataLabelPropagation');
    const texts = badges.map((b) => b.textContent);
    expect(texts).toEqual(expect.arrayContaining(['slo_label_team', 'slo_label_env']));
  });

  it('renders the exclusion-window row with the deferred-enforcement badge', () => {
    render(<SloMetadataPanel slo={makeSlo()} />);
    const deferred = screen.getByTestId('slosDetailMetadataExclusionDeferred');
    expect(deferred).toBeInTheDocument();
    expect(deferred).toHaveTextContent(/deferred/i);
  });

  it('renders the Advanced accordion collapsed by default', () => {
    render(<SloMetadataPanel slo={makeSlo()} />);
    const accordion = screen.getByTestId('slosDetailMetadataAdvanced');
    // EuiAccordion places aria-expanded on the trigger button.
    const button = accordion.querySelector('button[aria-expanded]');
    expect(button).not.toBeNull();
    expect(button!.getAttribute('aria-expanded')).toBe('false');
  });

  it('renders empty-state text when labels, annotations, and exclusion windows are missing', () => {
    render(
      <SloMetadataPanel slo={makeSlo({ labels: {}, annotations: {}, exclusionWindows: [] })} />
    );
    expect(screen.getByTestId('slosDetailMetadataLabelsEmpty')).toBeInTheDocument();
    expect(screen.getByTestId('slosDetailMetadataAnnotationsEmpty')).toBeInTheDocument();
    // Exclusion empty state lives inside the (collapsed) accordion DOM.
    expect(screen.getByTestId('slosDetailMetadataExclusionEmpty')).toBeInTheDocument();
  });
});
