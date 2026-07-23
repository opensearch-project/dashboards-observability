/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the Prometheus form section (simplified Create Rule flyout).
 *
 * Covers:
 *  - Trigger condition (For duration updates threshold only — no more
 *    pendingPeriod/evaluationInterval per-rule sync, those are rule-group
 *    concerns in managed Prometheus)
 *  - Builder/Code query mode toggle
 *  - Rule group selection propagating via the _ruleGroup metadata label
 *
 * Note: label-based queries (getByLabelText) are unreliable here because the
 * test environment stubs htmlIdGenerator, giving every form control the same
 * id. Queries use data-test-subj, text content, or option values instead.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrometheusFormSection } from '../create_monitor/prometheus_form_section';
import type { PrometheusFormState } from '../create_monitor/create_monitor_types';

// Mock dependencies that PrometheusFormSection uses
jest.mock('../promql_monaco_editor', () => ({
  PromQLMonacoEditor: () => <div data-test-subj="promql-editor" />,
}));
jest.mock('../metric_browser', () => ({
  MetricBrowser: () => <div data-test-subj="metric-browser" />,
}));
jest.mock('../monitor_form_components', () => ({
  LabelEditor: () => <div data-test-subj="label-editor" />,
  AnnotationEditor: () => <div data-test-subj="annotation-editor" />,
}));
jest.mock('../query_services/alerting_prom_resources_service', () => ({
  AlertingPromResourcesService: jest.fn().mockImplementation(() => ({
    listMetricNames: jest.fn().mockResolvedValue({ metrics: ['up', 'http_requests_total'] }),
    listLabelNames: jest.fn().mockResolvedValue({ labels: ['job', 'instance'] }),
    listLabelValues: jest.fn().mockResolvedValue({ values: ['node-exporter'] }),
  })),
}));

const baseForm: PrometheusFormState = {
  name: 'test-rule',
  datasourceId: 'ds-1',
  datasourceType: 'prometheus',
  query: 'up == 0',
  threshold: { operator: '>', value: 0, unit: '', forDuration: '5m' },
  evaluationInterval: '1m',
  pendingPeriod: '5m',
  firingPeriod: '5m',
  labels: [],
  annotations: [],
  severity: 'medium',
  enabled: true,
};

const mockDatasources = [{ id: 'ds-1', name: 'ObservabilityStack_Prometheus', type: 'prometheus' }];

/** Find the For Duration <select> by its distinctive duration option values. */
const findForDurationSelect = (container: HTMLElement): HTMLSelectElement => {
  const selects = Array.from(container.querySelectorAll('select'));
  const match = selects.find((s) => Array.from(s.options).some((o) => o.value === '30s'));
  if (!match) throw new Error('For duration select not found');
  return match;
};

describe('PrometheusFormSection — trigger condition', () => {
  it('changing For duration updates threshold.forDuration only', () => {
    const onUpdate = jest.fn();

    const { container } = render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    const forDurationSelect = findForDurationSelect(container);
    expect(forDurationSelect.value).toBe('5m');
    fireEvent.change(forDurationSelect, { target: { value: '30s' } });

    expect(onUpdate).toHaveBeenCalledWith(
      'threshold',
      expect.objectContaining({ forDuration: '30s' })
    );
    // Per-rule evaluation settings were removed — no pendingPeriod sync
    expect(onUpdate).not.toHaveBeenCalledWith('pendingPeriod', expect.anything());
    expect(onUpdate).not.toHaveBeenCalledWith('evaluationInterval', expect.anything());
  });

  it('does not render per-rule Evaluation Settings fields', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.queryByText('Evaluation interval')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending period')).not.toBeInTheDocument();
  });
});

describe('PrometheusFormSection — query mode toggle', () => {
  it('renders Builder mode by default with metric and label filter inputs', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.getByText('Metric')).toBeInTheDocument();
    // 'Label name' / 'Label value' appear as both form row label and
    // combo box placeholder text
    expect(screen.getAllByText('Label name').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Label value').length).toBeGreaterThan(0);
    expect(screen.getByText('Select a metric to start.')).toBeInTheDocument();
  });

  it('switches to Code mode showing the PromQL editor with query library and metric browser', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // EuiButtonGroup renders radio inputs with data-test-subj per option id
    fireEvent.click(screen.getByTestId('code'));

    expect(screen.getByTestId('promql-editor')).toBeInTheDocument();
    expect(screen.getByText(/Query library/)).toBeInTheDocument();
    expect(screen.getByText(/Metric browser/)).toBeInTheDocument();
  });

  it('shows the datasource selector when datasources are provided', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
        datasourceId="ds-1"
        datasources={mockDatasources}
      />
    );

    expect(screen.getByText('Datasource')).toBeInTheDocument();
    expect(screen.getByText('ObservabilityStack_Prometheus')).toBeInTheDocument();
  });
});

describe('PrometheusFormSection — rule group', () => {
  it('renders the Rule group section', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.getByText('Rule group')).toBeInTheDocument();
    expect(
      screen.getByText('Select an existing group or type a new name to create one.')
    ).toBeInTheDocument();
  });

  it('propagates rule group selection via the _ruleGroup metadata label', () => {
    const onUpdate = jest.fn();

    const { container } = render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // Switch to Code mode so the only remaining combo box is the rule group
    fireEvent.click(screen.getByTestId('code'));

    const comboInputs = container.querySelectorAll('[data-test-subj="comboBoxSearchInput"]');
    expect(comboInputs.length).toBe(1);
    const input = comboInputs[0];

    fireEvent.change(input, { target: { value: 'my-group' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith(
      'labels',
      expect.arrayContaining([expect.objectContaining({ key: '_ruleGroup', value: 'my-group' })])
    );
  });
});

describe('PrometheusFormSection — notification routing', () => {
  it('renders Alertmanager routing guidance', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.getByText('Notification routing')).toBeInTheDocument();
    expect(screen.getByText('Alertmanager')).toBeInTheDocument();
  });
});
