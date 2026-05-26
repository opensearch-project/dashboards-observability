/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import type { GeneratedRuleGroup, SloCreateInput } from '../../../../../../common/slo/slo_types';
import { GeneratedRulesPreview, PREVIEW_DEBOUNCE_MS } from '../generated_rules_preview';

jest.useFakeTimers();

function makeGroup(overrides: Partial<GeneratedRuleGroup> = {}): GeneratedRuleGroup {
  return {
    groupName: 'slo:my-api-availability',
    interval: 30,
    rules: [
      {
        type: 'recording',
        name: 'slo:sli_error:ratio_rate_5m',
        expr: 'sum(...) / sum(...)',
        labels: { slo_id: 'my-api-availability' },
        description: 'Rolling 5m error ratio',
      },
      {
        type: 'alerting',
        name: 'slo:burn_rate:my-api-availability_page_fast',
        expr: 'slo:sli_error:ratio_rate_5m > 14',
        for: '2m',
        labels: { severity: 'page' },
        annotations: { summary: 'burn rate exceeded' },
        description: '14× burn alert',
      },
    ],
    yaml:
      'groups:\n  - name: slo:my-api-availability\n    interval: 30s\n    rules:\n      - record: slo:sli_error:ratio_rate_5m\n        expr: sum(...) / sum(...)\n',
    ...overrides,
  };
}

// Minimal but spec-compliant SloCreateInput — shape only matters for equality
// checks; the api client is mocked.
function makeInput(overrides: Partial<SloCreateInput['spec']> = {}): SloCreateInput {
  return {
    spec: {
      datasourceId: 'ds-2',
      name: 'my-api-availability',
      enabled: true,
      mode: 'active',
      service: 'my-api',
      owner: { teams: ['sre'] },
      sli: {
        type: 'single',
        definition: {
          backend: 'prometheus',
          type: 'availability',
          calcMethod: 'events',
          metric: 'http_requests_total',
        },
        dimensions: [{ name: 'service', value: 'my-api' }],
      },
      objectives: [{ name: 'availability-99-9', target: 0.999 }],
      budgetWarningThresholds: [{ threshold: 0.5, severity: 'warning' }],
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
      ...overrides,
    },
  };
}

describe('GeneratedRulesPreview', () => {
  afterEach(() => {
    jest.clearAllTimers();
  });

  it('renders an empty prompt when no input is provided', () => {
    const preview = jest.fn();
    render(<GeneratedRulesPreview apiClient={{ preview }} input={null} />);
    expect(screen.getByTestId('slosWizardPreviewEmpty')).toBeInTheDocument();
    expect(preview).not.toHaveBeenCalled();
  });

  it('lists client-side validator errors as clickable links in the empty prompt', () => {
    const preview = jest.fn();
    render(
      <GeneratedRulesPreview
        apiClient={{ preview }}
        input={null}
        errors={{ 'spec.name': 'SLO name is required' }}
      />
    );
    expect(screen.getByTestId('slosWizardPreviewMissingList')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardPreviewMissing-spec.name')).toHaveTextContent(
      'Identity: SLO name is required'
    );
  });

  it('routes Bad Request server errors to the empty prompt (not the warning callout)', async () => {
    // OSD's HTTP client wraps a 400 from `res.customError({ body: ... })` as
    // an IHttpFetchError whose `.body` mirrors the route's body. Our SLO
    // route emits `{ error: 'Validation failed', errors: {...} }` for
    // SloValidationError. Match that shape so the structured detection
    // recognises this as validation.
    const validationError = Object.assign(new Error('Request failed: 400 Bad Request'), {
      body: {
        error: 'Validation failed',
        errors: { 'spec.name': 'SLO name is required' },
      },
    });
    const preview = jest.fn().mockRejectedValue(validationError);
    render(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput()} />);
    act(() => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    await screen.findByTestId('slosWizardPreviewEmpty');
    expect(screen.queryByTestId('slosWizardPreviewError')).toBeNull();
  });

  it('renders the namespace strip on success', async () => {
    const group = makeGroup();
    const preview = jest.fn().mockResolvedValue(group);
    render(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput()} />);
    act(() => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    expect(await screen.findByTestId('slosWizardPreviewNamespace')).toHaveTextContent(
      'slo-generated'
    );
  });

  it('does not call preview until the debounce elapses', async () => {
    const preview = jest.fn().mockResolvedValue(makeGroup());
    render(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput()} />);
    // Synchronously after render: debounce has not fired.
    expect(preview).not.toHaveBeenCalled();
    // Advance just shy of the debounce window.
    act(() => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS - 1);
    });
    expect(preview).not.toHaveBeenCalled();
    // Cross the boundary — now the fetch should fire exactly once.
    act(() => {
      jest.advanceTimersByTime(1);
    });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
  });

  it('renders rule count, group name, and the YAML from the server response', async () => {
    const group = makeGroup();
    const preview = jest.fn().mockResolvedValue(group);
    render(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput()} />);
    act(() => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    await waitFor(() => expect(preview).toHaveBeenCalled());

    // Rule count badge
    expect(await screen.findByTestId('slosWizardPreviewRuleCount')).toHaveTextContent('2 rules');
    // Group name
    expect(screen.getByTestId('slosWizardPreviewGroupName')).toHaveTextContent(group.groupName);
    // YAML from server response is rendered verbatim.
    expect(screen.getByTestId('slosWizardPreviewYaml')).toHaveTextContent(
      'slo:sli_error:ratio_rate_5m'
    );
  });

  it('renders a warning callout when the preview call rejects', async () => {
    const preview = jest.fn().mockRejectedValue(new Error('boom'));
    render(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput()} />);
    act(() => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    const cb = await screen.findByTestId('slosWizardPreviewError');
    expect(cb).toHaveTextContent('boom');
  });

  it('coalesces rapid input changes into a single preview call', async () => {
    const preview = jest.fn().mockResolvedValue(makeGroup());
    const { rerender } = render(
      <GeneratedRulesPreview apiClient={{ preview }} input={makeInput({ name: 'a' })} />
    );
    act(() => {
      jest.advanceTimersByTime(200);
    });
    rerender(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput({ name: 'ab' })} />);
    act(() => {
      jest.advanceTimersByTime(200);
    });
    rerender(<GeneratedRulesPreview apiClient={{ preview }} input={makeInput({ name: 'abc' })} />);
    // Before debounce completes on the latest input, nothing should have fired.
    expect(preview).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(PREVIEW_DEBOUNCE_MS);
    });
    await waitFor(() => expect(preview).toHaveBeenCalledTimes(1));
    expect(preview).toHaveBeenLastCalledWith(
      expect.objectContaining({ spec: expect.objectContaining({ name: 'abc' }) })
    );
  });
});
