/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { StructuredSliEditor } from '../structured_sli_editor';
import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import { initialState, applyTemplate } from '../wizard_state';
import type { FormState } from '../wizard_state';

// usePrometheusMetadata reaches coreRefs.http; stub it for the metric picker.
jest.mock('../../../../alerting/hooks/use_prometheus_metadata', () => ({
  usePrometheusMetadata: () => ({
    metricOptions: [{ label: 'http_server_request_duration_seconds_count' }],
    metricsLoading: false,
    searchMetrics: jest.fn(),
    labelNames: [],
    labelNamesLoading: false,
    labelValues: {},
    labelValuesLoading: {},
    fetchLabelValues: jest.fn(),
    metricMetadata: [],
    error: false,
    applyTemplate: jest.fn(),
  }),
}));

const HTTP_AVAIL = SLO_TEMPLATES.find((t) => t.id === 'http-availability')!;
const HTTP_LATENCY = SLO_TEMPLATES.find((t) => t.id === 'http-latency')!;

/** Build form state as the wizard would after applying a template + service. */
function stateFor(templateId: string, service = 'frontend'): FormState {
  const t = SLO_TEMPLATES.find((x) => x.id === templateId)!;
  let s = applyTemplate(initialState(), t);
  s = { ...s, service, dimensions: [{ name: 'service_name', value: service }] };
  return s;
}

function renderEditor(template = HTTP_AVAIL, state = stateFor(template.id), dispatch = jest.fn()) {
  render(
    <StructuredSliEditor
      state={state}
      errors={{}}
      dispatch={dispatch}
      template={template}
      datasourceId="ds-1"
    />
  );
  return dispatch;
}

describe('StructuredSliEditor', () => {
  it('renders a plain-language summary + read-only query for availability', () => {
    renderEditor(HTTP_AVAIL);
    expect(screen.getByTestId('slosWizardStructuredSliSummary')).toHaveTextContent('frontend');
    expect(screen.getByTestId('slosWizardStructuredSliSummaryQuery')).toHaveTextContent(
      /http_server_request_duration_seconds_count/
    );
  });

  it('keeps Advanced collapsed for an untouched template default', () => {
    renderEditor(HTTP_AVAIL);
    const btn = screen
      .getByTestId('slosWizardStructuredSliAdvanced')
      .querySelector('button[aria-expanded]');
    expect(btn).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-opens Advanced when the metric was changed from the template default', () => {
    const s = { ...stateFor('http-availability'), metric: 'my_custom_metric_total' };
    renderEditor(HTTP_AVAIL, s);
    const btn = screen
      .getByTestId('slosWizardStructuredSliAdvanced')
      .querySelector('button[aria-expanded]');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
  });

  it('exposes an editable metric picker in Advanced for availability', () => {
    const dispatch = renderEditor(HTTP_AVAIL);
    const picker = screen.getByTestId('slosWizardStructuredSliMetric');
    fireEvent.click(within(picker).getByTestId('comboBoxToggleListButton'));
    fireEvent.click(
      screen.getByRole('option', { name: 'http_server_request_duration_seconds_count' })
    );
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setField',
      field: 'metric',
      value: 'http_server_request_duration_seconds_count',
    });
  });

  it('shows the good-events filter only for availability', () => {
    renderEditor(HTTP_AVAIL);
    expect(screen.getByTestId('slosWizardGoodEventsFilter')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardStructuredSliLatencyHint')).toBeNull();
  });

  it('shows the latency hint (no good-filter) for latency templates', () => {
    renderEditor(HTTP_LATENCY, stateFor('http-latency'));
    expect(screen.getByTestId('slosWizardStructuredSliLatencyHint')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardGoodEventsFilter')).toBeNull();
  });

  it('builds a latency summary query referencing the le bound', () => {
    const s = stateFor('http-latency');
    // applyTemplate seeds objective[0].latencyThreshold from the template default.
    renderEditor(HTTP_LATENCY, s);
    expect(screen.getByTestId('slosWizardStructuredSliSummaryQuery')).toHaveTextContent(/le=/);
  });

  it('latency summary matches the generator: _bucket metric + unit-scaled le (M2)', () => {
    // A millisecond threshold must render as the unit-scaled, generator-formatted
    // le bound on the histogram `_bucket` metric — not the raw "500" on the bare
    // metric. This is the divergence M2 flagged between preview and deploy.
    const base = stateFor('http-latency');
    const s: FormState = {
      ...base,
      metric: 'http_server_request_duration_seconds', // no _bucket suffix
      latencyThresholdUnit: 'milliseconds',
      objectives: base.objectives.map((o, i) => (i === 0 ? { ...o, latencyThreshold: '500' } : o)),
    };
    renderEditor(HTTP_LATENCY, s);
    const q = screen.getByTestId('slosWizardStructuredSliSummaryQuery').textContent ?? '';
    expect(q).toContain('http_server_request_duration_seconds_bucket');
    expect(q).toContain('le="0.5"');
    expect(q).not.toContain('le="500"');
  });
});
