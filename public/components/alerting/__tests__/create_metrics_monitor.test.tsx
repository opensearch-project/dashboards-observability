/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';

jest.mock('echarts', () => ({
  init: jest.fn(() => ({ setOption: jest.fn(), resize: jest.fn(), dispose: jest.fn() })),
}));

jest.mock('../promql_monaco_editor', () => ({
  PromQLMonacoEditor: ({ value }: { value: string }) => (
    <textarea data-test-subj="promqlMock" defaultValue={value} />
  ),
}));
jest.mock('../promql_editor', () => ({
  PromQLEditor: ({ value }: { value: string }) => (
    <textarea data-test-subj="promqlMock" defaultValue={value} />
  ),
}));

jest.mock('../metric_browser', () => ({
  MetricBrowser: () => <div data-test-subj="metricBrowserMock" />,
}));
// Stub the shared builder with a button that emits a query, so tests can
// simulate an explicit builder selection (the form seeds query: '' and the
// Create button stays disabled until the builder produces one)
jest.mock('../create_monitor/prom_query_builder', () => ({
  PromQueryBuilder: ({ onQueryChange }: { onQueryChange: (q: string) => void }) => (
    <button data-test-subj="mockBuilderSetQuery" onClick={() => onQueryChange('up{job="api"}')} />
  ),
  // Lightweight stand-in: builder-representable = a bare metric or metric{...};
  // anything else (rates, comparisons) returns null. Used by the Query section
  // to decide the "builder will overwrite your expression" warning.
  parseBuilderQuery: (q: string) => {
    const m = (q || '').trim().match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?$/);
    return m ? { metric: m[1] } : null;
  },
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

import {
  CreateMetricsMonitor,
  materializeLabels,
  materializeAnnotations,
  startsWithComparison,
} from '../create_metrics_monitor';

describe('CreateMetricsMonitor materialize/validate helpers', () => {
  it('materializeLabels drops empty-key/value entries and trims keys', () => {
    expect(
      materializeLabels([
        { key: 'severity', value: 'warning', isDynamic: false },
        { key: 'team', value: '', isDynamic: false }, // empty value → dropped
        { key: '', value: 'x', isDynamic: false }, // empty key → dropped
        { key: '  region  ', value: 'us', isDynamic: false }, // key trimmed
      ])
    ).toEqual([
      { key: 'severity', value: 'warning', isDynamic: false },
      { key: 'region', value: 'us', isDynamic: false },
    ]);
  });

  it('materializeAnnotations drops empties and folds the description field (description wins)', () => {
    const annotations = [
      { key: 'summary', value: 'high' },
      { key: 'runbook', value: '' }, // dropped
      { key: 'description', value: 'manual' }, // overridden by the field
    ];
    expect(materializeAnnotations(annotations, 'from field')).toEqual([
      { key: 'summary', value: 'high' },
      { key: 'description', value: 'from field' },
    ]);
  });

  it('startsWithComparison flags a leading comparison (invalid alert expression)', () => {
    expect(startsWithComparison('> 0.5')).toBe(true);
    expect(startsWithComparison('  >= 1')).toBe(true);
    expect(startsWithComparison('rate(x[5m]) > 0.5')).toBe(false);
    expect(startsWithComparison('up')).toBe(false);
  });
});

describe('CreateMetricsMonitor', () => {
  it('renders flyout with form title', () => {
    render(<CreateMetricsMonitor onCancel={jest.fn()} onSave={jest.fn()} />);
    expect(document.body.textContent).toContain('Create metrics rule');
  });

  it('calls onCancel when flyout close is clicked', () => {
    const onCancel = jest.fn();
    render(<CreateMetricsMonitor onCancel={onCancel} onSave={jest.fn()} />);
    const closeBtn = document.querySelector('[data-test-subj="euiFlyoutCloseButton"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables Create button when datasourceId is empty', () => {
    render(<CreateMetricsMonitor onCancel={jest.fn()} onSave={jest.fn()} datasourceId="" />);
    const createBtn = document.querySelector(
      'button[class*="euiButton--fill"]'
    ) as HTMLButtonElement;
    expect(createBtn).not.toBeNull();
    expect(createBtn!.disabled).toBe(true);
  });

  it('defaults to the first Prometheus datasource from a provided list (Alert Manager)', () => {
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasources={[
          { id: 'os-1', name: 'SomeOpenSearch', type: 'opensearch' },
          { id: 'prom-1', name: 'MyPrometheus', type: 'prometheus' },
          { id: 'prom-2', name: 'OtherProm', type: 'prometheus' },
        ]}
      />
    );
    // The first prometheus datasource is preselected and shown in the picker
    expect(document.body.textContent).toContain('MyPrometheus');
    expect(document.body.textContent).not.toContain('SomeOpenSearch');
  });

  it('blocks save and shows an error for duplicate rule names', () => {
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        isNameTaken={(name) => name === 'taken-name'}
      />
    );
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    expect(nameInput).not.toBeNull();
    fireEvent.change(nameInput, { target: { value: 'taken-name' } });

    expect(document.body.textContent).toContain(
      'A rule with this name already exists on the selected datasource.'
    );
    const createBtn = document.querySelector(
      'button[class*="euiButton--fill"]'
    ) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });

  it('seeds the query from initialQuery copied off the Explore Metrics page', () => {
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        initialQuery="rate(http_requests_total[5m])"
      />
    );

    // The pre-filled expression is visible/editable (not hidden), so a complex
    // expression the builder can't represent is never hidden-yet-submittable.
    const expr = document.querySelector(
      '[data-test-subj="metricsMonitorPromQlExpression"]'
    ) as HTMLTextAreaElement;
    expect(expr).not.toBeNull();
    expect(expr.value).toBe('rate(http_requests_total[5m])');

    // With the query seeded, Create enables as soon as a name is entered — no
    // separate builder selection required.
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'r' } });
    const createBtn = document.querySelector(
      'button[class*="euiButton--fill"]'
    ) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);
  });

  it('defaults to Code mode when a query is copied in, Builder mode when empty', () => {
    // Copied query -> Code mode: raw expression shown, builder hidden.
    const { unmount } = render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        initialQuery="rate(http_requests_total[5m]) > 0.5"
      />
    );
    expect(
      document.querySelector('[data-test-subj="metricsMonitorPromQlExpression"]')
    ).not.toBeNull();
    expect(document.querySelector('[data-test-subj="mockBuilderSetQuery"]')).toBeNull();
    unmount();

    // Empty flyout -> Builder mode: builder shown, raw expression hidden.
    render(<CreateMetricsMonitor onCancel={jest.fn()} onSave={jest.fn()} datasourceId="prom-1" />);
    expect(document.querySelector('[data-test-subj="mockBuilderSetQuery"]')).not.toBeNull();
    expect(document.querySelector('[data-test-subj="metricsMonitorPromQlExpression"]')).toBeNull();
  });

  it('warns before the builder overwrites a copied complex expression (finding #7)', () => {
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        initialQuery="rate(http_requests_total[5m]) > 0.5"
      />
    );
    // Starts in Code mode — no overwrite warning yet.
    expect(
      document.querySelector('[data-test-subj="metricsMonitorBuilderOverwriteWarning"]')
    ).toBeNull();
    // Switch to Builder — the copied expression isn't builder-representable, so
    // the warning appears instead of silently clobbering it.
    fireEvent.click(screen.getByText('Builder'));
    expect(
      document.querySelector('[data-test-subj="metricsMonitorBuilderOverwriteWarning"]')
    ).not.toBeNull();
  });

  it('keeps Create disabled for a comparison-only expression', () => {
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        initialQuery="> 0.5"
      />
    );
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'bad-rule' } });
    const createBtn = document.querySelector(
      'button[class*="euiButton--fill"]'
    ) as HTMLButtonElement;
    // Name + query present, but the expression is only a comparison → blocked.
    expect(createBtn.disabled).toBe(true);
  });

  it('trims the rule name and group name in the save payload', async () => {
    const mockPost = jest.fn().mockResolvedValue({});
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="test-ds-123"
        initialQuery="up"
        http={{ post: mockPost }}
        addToast={jest.fn()}
      />
    );
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: '  spaced-rule  ' } });
    fireEvent.click(document.querySelector('button[class*="euiButton--fill"]')!);

    await waitFor(() => expect(mockPost).toHaveBeenCalled());
    const body = JSON.parse(mockPost.mock.calls[0][1].body);
    expect(body.name).toBe('spaced-rule');
    expect(body.groupName).toBe('spaced-rule');
  });

  it('shows namespace, rule group, and evaluation interval in the YAML preview (finding #10)', () => {
    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        initialQuery="up"
      />
    );
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'my-rule' } });

    // The Rule Preview (YAML) block renders its content even while collapsed.
    const body = document.body.textContent || '';
    // Namespace comment + the rule-group wrapper (group name defaults to the
    // rule name) + the group-level evaluation interval — all part of what the
    // save payload actually writes, so the preview now reflects it.
    expect(body).toContain('# namespace: observability-alerting');
    expect(body).toContain('name: "my-rule"');
    expect(body).toContain('interval: 1m');
    expect(body).toContain('rules:');
    expect(body).toContain('- alert: "my-rule"');
  });

  it('shows the "Build query in metrics" link only when requested (Alert Manager)', () => {
    const { unmount } = render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={jest.fn()}
        datasourceId="prom-1"
        showBuildInMetricsLink
      />
    );
    expect(
      document.querySelector('[data-test-subj="alertManagerOpenInMetricsLink"]')
    ).not.toBeNull();
    unmount();

    // Metrics Explore page context: link must be absent (circular hop)
    render(<CreateMetricsMonitor onCancel={jest.fn()} onSave={jest.fn()} datasourceId="prom-1" />);
    expect(document.querySelector('[data-test-subj="alertManagerOpenInMetricsLink"]')).toBeNull();
  });

  it('POSTs the correct payload shape on save', async () => {
    const mockPost = jest.fn().mockResolvedValue({});
    const onSave = jest.fn();
    const addToast = jest.fn();

    render(
      <CreateMetricsMonitor
        onCancel={jest.fn()}
        onSave={onSave}
        datasourceId="test-ds-123"
        datasourceName="Test Prometheus"
        http={{ post: mockPost }}
        addToast={addToast}
      />
    );

    // Fill in required fields: monitorName + an explicit builder selection
    // (the form seeds query: '' — no invisible default expression)
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'my-test-rule' } });
    fireEvent.click(document.querySelector('[data-test-subj="mockBuilderSetQuery"]')!);

    // Click Create button
    const createBtn = document.querySelector(
      'button[class*="euiButton--fill"]'
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/api/alerting/prometheus/test-ds-123/rules',
        expect.objectContaining({ body: expect.any(String) })
      );
    });

    // Verify payload structure
    const body = JSON.parse(mockPost.mock.calls[0][1].body);
    expect(body).toMatchObject({
      name: 'my-test-rule',
      query: expect.any(String),
      forDuration: expect.any(String),
      evaluationInterval: expect.any(String),
      enabled: true,
      groupName: 'my-test-rule',
    });
    expect(body).toHaveProperty('labels');
    expect(body).toHaveProperty('annotations');
    // The PromQL expression is the complete alert condition — no separate
    // operator/threshold is sent (Trigger condition section was removed)
    expect(body).not.toHaveProperty('operator');
    expect(body).not.toHaveProperty('threshold');

    // Should call onSave and show success toast
    expect(onSave).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });
});
