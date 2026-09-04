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
import { parseBuilderQuery } from '../create_monitor/prom_query_builder';
import type { PrometheusFormState } from '../create_monitor/create_monitor_types';

// Mock dependencies that PrometheusFormSection uses
jest.mock('../monitor_form_components', () => ({
  LabelEditor: jest.fn(() => <div data-test-subj="label-editor" />),
  AnnotationEditor: () => <div data-test-subj="annotation-editor" />,
}));
jest.mock('../echarts_render', () => ({
  EchartsRender: () => <div data-test-subj="echarts-render" />,
}));
jest.mock('../query_services/alerting_prom_resources_service', () => ({
  AlertingPromResourcesService: jest.fn().mockImplementation(() => ({
    listMetricNames: jest.fn().mockResolvedValue({ metrics: ['up', 'http_requests_total'] }),
    listLabelNames: jest.fn().mockResolvedValue({ labels: ['job', 'instance'] }),
    listLabelValues: jest.fn().mockResolvedValue({ values: ['node-exporter'] }),
    listRuleGroupNames: jest.fn().mockResolvedValue({ groups: ['team-a-rules', 'team-b-rules'] }),
    runQueryPreview: jest.fn().mockResolvedValue({
      points: [
        { timestamp: 1_700_000_000_000, value: 0.02 },
        { timestamp: 1_700_000_060_000, value: 0.05 },
      ],
    }),
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
    expect(screen.queryByText('Evaluation interval')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending period')).not.toBeInTheDocument();
  });

  it('renders the For duration select and wires it to threshold.forDuration', () => {
    const onUpdate = jest.fn();

    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    const select = screen.getByTestId('prometheusForDurationSelect') as HTMLSelectElement;
    expect(select.value).toBe('5m');
    fireEvent.change(select, { target: { value: '10m' } });

    expect(onUpdate).toHaveBeenCalledWith(
      'threshold',
      expect.objectContaining({ forDuration: '10m' })
    );
  });

  it('runs a real range query and renders the results chart after clicking Run preview', async () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
        datasourceId="ds-1"
      />
    );

    // No results until requested
    expect(screen.queryByTestId('echarts-render')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('prometheusRunPreviewButton'));

    // The chart renders once the live range query resolves (no more hardcoded
    // "sample data" callout).
    expect(await screen.findByTestId('echarts-render')).toBeInTheDocument();
    expect(
      screen.queryByText('Sample data — run the rule to see real results')
    ).not.toBeInTheDocument();
  });

  it('renders the "Build query in metrics" link in the query panel header', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.getByTestId('alertManagerOpenInMetricsLink')).toBeInTheDocument();
    expect(screen.getByText('Build query in metrics →')).toBeInTheDocument();
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

    expect(screen.getByText('Rule details')).toBeInTheDocument();
    expect(screen.getByText('Rule group')).toBeInTheDocument();
    // Namespace is fixed and read-only
    expect(screen.getByDisplayValue('observability-alerting')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Rules within a group share an evaluation interval and are evaluated together.'
      )
    ).toBeInTheDocument();
  });

  it('renders the shell-provided rule name field inside Rule details', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
        ruleNameField={<input data-test-subj="shellRuleNameField" />}
      />
    );

    expect(screen.getByTestId('shellRuleNameField')).toBeInTheDocument();
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

    // Rule details renders first, so the rule group combo box is the 1st;
    // the builder's 3 combo boxes (metric, label name, label value) follow
    const comboInputs = container.querySelectorAll('[data-test-subj="comboBoxSearchInput"]');
    expect(comboInputs.length).toBe(4);
    const input = comboInputs[0];

    fireEvent.change(input, { target: { value: 'my-group' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });

    expect(onUpdate).toHaveBeenCalledWith(
      'labels',
      expect.arrayContaining([expect.objectContaining({ key: '_ruleGroup', value: 'my-group' })])
    );
  });

  it('hides _ruleGroup from the label editor and preserves it through label edits', () => {
    const onUpdate = jest.fn();
    const labelEditorProps: any[] = [];
    // Capture what LabelEditor receives via the module mock
    const { LabelEditor } = jest.requireMock('../monitor_form_components');
    LabelEditor.mockImplementation((props: any) => {
      labelEditorProps.push(props);
      return <div data-test-subj="label-editor" />;
    });

    render(
      <PrometheusFormSection
        form={{
          ...baseForm,
          labels: [
            { key: 'severity', value: 'warning', isDynamic: false },
            { key: '_ruleGroup', value: 'my-group', isDynamic: false },
          ],
        }}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // _ruleGroup must not be visible in the editor
    const received = labelEditorProps[labelEditorProps.length - 1];
    expect(received.labels).toEqual([{ key: 'severity', value: 'warning', isDynamic: false }]);

    // Label edits must re-append _ruleGroup so it survives
    received.onChange([{ key: 'team', value: 'obs', isDynamic: false }]);
    expect(onUpdate).toHaveBeenCalledWith('labels', [
      { key: 'team', value: 'obs', isDynamic: false },
      { key: '_ruleGroup', value: 'my-group', isDynamic: false },
    ]);
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

describe('PrometheusFormSection — dynamic labels', () => {
  it('single-quotes templated label values in the YAML preview', () => {
    const { container } = render(
      <PrometheusFormSection
        form={{
          ...baseForm,
          labels: [
            {
              key: 'severity',
              value: '{{ if gt $value 0.9 }}critical{{ else }}warning{{ end }}',
              isDynamic: true,
            },
          ],
        }}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    const yaml = container.querySelector('pre')!.textContent || '';
    expect(yaml).toContain("severity: '{{ if gt $value 0.9 }}critical{{ else }}warning{{ end }}'");
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

describe('parseBuilderQuery — edit-mode builder seeding', () => {
  it('parses a bare metric', () => {
    expect(parseBuilderQuery('up')).toEqual({ metric: 'up' });
  });

  it('parses a metric with a single label matcher', () => {
    expect(parseBuilderQuery('up{instance="host-1"}')).toEqual({
      metric: 'up',
      labelName: 'instance',
      labelOperator: '=',
      labelValue: 'host-1',
    });
  });

  it('unescapes quotes and backslashes in the label value', () => {
    expect(parseBuilderQuery('up{path="C:\\\\dir\\"x\\""}')).toEqual({
      metric: 'up',
      labelName: 'path',
      labelOperator: '=',
      labelValue: 'C:\\dir"x"',
    });
  });

  it('returns null for expressions the builder cannot represent', () => {
    expect(parseBuilderQuery('sum(rate(http_requests_total[5m])) > 0.05')).toBeNull();
    expect(parseBuilderQuery('up == 0')).toBeNull();
    expect(parseBuilderQuery('up{a="1",b="2"}')).toBeNull();
    expect(parseBuilderQuery('')).toBeNull();
  });
});

describe('PrometheusFormSection — edit mode seeding', () => {
  it('seeds builder selections from a builder-shaped query', () => {
    render(
      <PrometheusFormSection
        form={{ ...baseForm, query: 'http_requests_total{job="api"}' }}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.getByText('http_requests_total')).toBeInTheDocument();
    expect(screen.getByText('job')).toBeInTheDocument();
    expect(screen.getByText('api')).toBeInTheDocument();
  });

  it('clears a builder-authored query when the metric is cleared, but never a complex one', () => {
    const onUpdate = jest.fn();
    const { container } = render(
      <PrometheusFormSection
        form={{ ...baseForm, query: 'up{job="api"}' }}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // Builder was seeded from the builder-shaped query; clear the metric
    // via the combo box clear button
    const clearButtons = container.querySelectorAll('[data-test-subj="comboBoxClearButton"]');
    expect(clearButtons.length).toBeGreaterThan(0);
    fireEvent.click(clearButtons[0]);

    expect(onUpdate).toHaveBeenCalledWith('query', '');
  });

  it('does not re-emit / rewrite a non-canonically-spaced seeded query on mount', () => {
    const onUpdate = jest.fn();
    render(
      <PrometheusFormSection
        form={{ ...baseForm, query: 'up{ job = "api" }' }}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // The builder seeds its fields from the query but must NOT rewrite it on
    // mount — re-emitting would normalize the whitespace the user never touched
    // (`up{ job = "api" }` → `up{job="api"}`) and spuriously mark the form dirty.
    expect(onUpdate).not.toHaveBeenCalledWith('query', expect.anything());
  });

  it('does not clobber a complex seeded query on mount', () => {
    const onUpdate = jest.fn();
    render(
      <PrometheusFormSection
        form={{ ...baseForm, query: 'sum(rate(http_requests_total[5m])) > 0.05' }}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // Builder is unseeded (query not representable), so the builder→query
    // sync must stay inert — no query updates on mount
    expect(onUpdate).not.toHaveBeenCalledWith('query', expect.anything());
  });
});

describe('PrometheusFormSection — notification routing', () => {
  it('does not render a Notification routing section (matches the Metrics page flyout)', () => {
    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={jest.fn()}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    expect(screen.queryByText('Notification routing')).not.toBeInTheDocument();
    // The Labels section hint still conveys the routing relationship
    expect(screen.getByText('Categorize and route alerts')).toBeInTheDocument();
  });
});
