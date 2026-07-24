/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for the Prometheus form section (simplified Create Rule flyout).
 *
 * The form is builder-only: the PromQL query assembled from the metric and
 * label filters is the complete alert expression. There is no Code mode,
 * Trigger condition, or per-rule evaluation settings (those are rule-group
 * concerns in managed Prometheus).
 *
 * Note: label-based queries (getByLabelText) are unreliable here because the
 * test environment stubs htmlIdGenerator, giving every form control the same
 * id. Queries use data-test-subj, text content, or placeholders instead.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrometheusFormSection } from '../create_monitor/prometheus_form_section';
import type { PrometheusFormState } from '../create_monitor/create_monitor_types';

// Mock dependencies that PrometheusFormSection uses
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

describe('PrometheusFormSection — simplified layout', () => {
  it('renders the builder with metric and label filter inputs', () => {
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

  it('does not render Code mode, Trigger condition, or Evaluation Settings', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.queryByText('Code')).not.toBeInTheDocument();
    expect(screen.queryByText(/Query library/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Metric browser/)).not.toBeInTheDocument();
    expect(screen.queryByText('Trigger condition')).not.toBeInTheDocument();
    expect(screen.queryByText('Operator')).not.toBeInTheDocument();
    expect(screen.queryByText('For duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Evaluation interval')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending period')).not.toBeInTheDocument();
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

    // Builder has 3 combo boxes (metric, label name, label value);
    // the rule group combo box is the 4th and last
    const comboInputs = container.querySelectorAll('[data-test-subj="comboBoxSearchInput"]');
    expect(comboInputs.length).toBe(4);
    const input = comboInputs[comboInputs.length - 1];

    fireEvent.change(input, { target: { value: 'my-group' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith(
      'labels',
      expect.arrayContaining([expect.objectContaining({ key: '_ruleGroup', value: 'my-group' })])
    );
  });

  it('initializes the rule group from an existing _ruleGroup label (edit mode)', () => {
    render(
      <PrometheusFormSection
        form={{
          ...baseForm,
          labels: [{ key: '_ruleGroup', value: 'existing-group', isDynamic: false }],
        }}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.getByText('existing-group')).toBeInTheDocument();
  });
});

describe('PrometheusFormSection — YAML preview', () => {
  it('uses the query as the complete expression and hides _ruleGroup', () => {
    const { container } = render(
      <PrometheusFormSection
        form={{
          ...baseForm,
          labels: [
            { key: 'severity', value: 'warning', isDynamic: false },
            { key: '_ruleGroup', value: 'my-group', isDynamic: false },
          ],
        }}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    const pre = container.querySelector('pre');
    expect(pre).not.toBeNull();
    const yaml = pre!.textContent || '';
    // The query is the complete expression — no operator/threshold appended
    expect(yaml).toContain('expr: up == 0\n');
    // Group name comes from the _ruleGroup label
    expect(yaml).toContain('name: my-group');
    // _ruleGroup must not leak into the labels block
    expect(yaml).not.toContain('_ruleGroup');
    expect(yaml).toContain('severity: "warning"');
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
