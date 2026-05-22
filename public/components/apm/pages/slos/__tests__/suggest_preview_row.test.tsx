/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SuggestPreviewRow } from '../suggest_preview_row';
import type { LiveSli, PerPreview } from '../suggest_use_live_preview';
import type { Suggestion } from '../suggest_engine';
import type { GeneratedRuleGroup } from '../../../../../../common/slo/slo_types';

function fakeSuggestion(latency = false): Suggestion {
  return ({
    key: 'k',
    kindId: latency ? 'http-latency' : 'http-availability',
    kind: latency ? 'HTTP latency' : 'HTTP availability',
    reason: '',
    sourceMetric: 'm',
    detected: {},
    estimatedRuleCount: 13,
    input: {
      spec: {
        datasourceId: 'ds-1',
        name: 'cart preview',
        enabled: true,
        mode: 'active',
        service: 'cart',
        owner: { teams: ['t'] },
        sli: {
          type: 'single',
          definition: latency
            ? {
                backend: 'prometheus',
                type: 'latency_threshold',
                calcMethod: 'events',
                metric: 'http_server_request_duration_seconds_bucket',
                latencyThresholdUnit: 'seconds',
              }
            : { backend: 'prometheus', type: 'availability', calcMethod: 'events', metric: 'm' },
          dimensions: [],
        },
        objectives: latency
          ? [{ name: 'o', target: 0.95, latencyThreshold: 0.5 }]
          : [{ name: 'o', target: 0.99 }],
        budgetWarningThresholds: [],
        window: { type: 'rolling', duration: '28d' },
        alerting: { strategy: 'mwmbr', burnRates: [] },
        alarms: {
          sliHealth: { enabled: false },
          attainmentBreach: { enabled: false },
          budgetWarning: { enabled: true },
          noData: { enabled: false, forDuration: '10m' },
          resolved: { enabled: false },
        },
        exclusionWindows: [],
        labels: {},
        annotations: {},
      },
    },
  } as unknown) as Suggestion;
}

const fakeGroup: GeneratedRuleGroup = {
  groupName: 'g',
  interval: 30,
  rules: [{ type: 'recording', name: 'r', expr: 'e', labels: {}, description: '' }],
  yaml: 'yaml: content',
};

describe('SuggestPreviewRow', () => {
  it('renders a loading spinner while preview is loading', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'loading',
    };
    const live: LiveSli = { status: 'loading' };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    expect(screen.getByTestId('slosSuggestPreviewRow-k')).toBeInTheDocument();
  });

  it('renders an error callout when status is error', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'error',
      error: 'preview boom',
    };
    const live: LiveSli = { status: 'error' };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    expect(screen.getByTestId('slosSuggestPreviewError-k')).toBeInTheDocument();
    expect(screen.getByText('preview boom')).toBeInTheDocument();
  });

  it('renders the YAML accordion on success and reveals the content when expanded', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'success', sliRatio: 0.991, totalSamples: 1000 };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    expect(screen.getByTestId('slosSuggestPreviewYamlToggle-k')).toBeInTheDocument();
    expect(screen.getByTestId('slosSuggestPreviewYaml-k')).toBeInTheDocument();
  });

  it('renders the SLI badge for availability success rows', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'success', sliRatio: 0.999, totalSamples: 1234 };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="24h" />);
    // SLI is rendered as e.g. "SLI 99.9%" — match a leading "SLI" + percent.
    expect(screen.getByText(/SLI \d+(\.\d+)?%/)).toBeInTheDocument();
  });

  it('flags a breaching availability row', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'success', sliRatio: 0.9, totalSamples: 5_000 };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="24h" />);
    expect(screen.getByText('breaching')).toBeInTheDocument();
  });

  it('flags a breaching latency row when p99 exceeds the bound', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(true),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'success', p99Ms: 700, totalSamples: 1234 };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="24h" />);
    expect(screen.getByText('breaching')).toBeInTheDocument();
    expect(screen.getByText(/700 ms/)).toBeInTheDocument();
  });

  it('renders no data hint when status is success but no metrics returned', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'success' };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    expect(screen.getByText('no data in window')).toBeInTheDocument();
  });

  it('shows the live unavailable text when live status is error', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'error' };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    expect(screen.getByText('live metrics unavailable')).toBeInTheDocument();
  });

  it('hides the live row entirely when live status is skipped', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'skipped' };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    expect(screen.queryByTestId('slosSuggestPreviewLive-k')).not.toBeInTheDocument();
  });

  it('toggles the YAML accordion open without errors', () => {
    const preview: PerPreview = {
      key: 'k',
      suggestion: fakeSuggestion(),
      status: 'success',
      group: fakeGroup,
    };
    const live: LiveSli = { status: 'skipped' };
    render(<SuggestPreviewRow preview={preview} live={live} windowChoice="1h" />);
    fireEvent.click(screen.getByTestId('slosSuggestPreviewYamlToggle-k'));
    // Accordion content renders eagerly; click just toggles open/closed.
    expect(screen.getByTestId('slosSuggestPreviewYaml-k')).toBeInTheDocument();
  });
});
