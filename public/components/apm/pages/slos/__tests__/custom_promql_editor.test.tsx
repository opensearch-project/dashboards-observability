/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { CustomPromqlEditor } from '../custom_promql_editor';
import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import type { FormState } from '../wizard_state';

// The `custom` template carries no customPromqlDefaults, so the Advanced
// builder is open by default — letting these tests exercise the builder
// directly. The apm-service-availability template (with defaults) is used
// where the simple-view summary behavior is under test.
const CUSTOM_TEMPLATE = SLO_TEMPLATES.find((t) => t.id === 'custom')!;
const APM_TEMPLATE = SLO_TEMPLATES.find((t) => t.id === 'apm-service-availability')!;

// usePrometheusMetadata reaches coreRefs.http via AlertingPromResourcesService.
// Stub it so the metric picker renders with controllable autocomplete data.
jest.mock('../../../../alerting/hooks/use_prometheus_metadata', () => ({
  usePrometheusMetadata: () => ({
    metricOptions: [{ label: 'http_requests_total' }],
    metricsLoading: false,
    searchMetrics: jest.fn(),
    labelNames: ['service', 'status_code'],
    labelNamesLoading: false,
    labelValues: { service: [{ label: 'my-api' }] },
    labelValuesLoading: {},
    fetchLabelValues: jest.fn(),
    metricMetadata: [],
    error: false,
    applyTemplate: jest.fn(),
  }),
}));

function customPromql(
  overrides: Partial<FormState['customPromql']> = {}
): FormState['customPromql'] {
  return { mode: 'events', goodQuery: '', totalQuery: '', errorRatioQuery: '', ...overrides };
}

function renderEditor(
  value = customPromql(),
  dispatch = jest.fn(),
  opts: { template?: typeof CUSTOM_TEMPLATE; service?: string } = {}
) {
  render(
    <CustomPromqlEditor
      value={value}
      errors={{}}
      dispatch={dispatch}
      datasourceId="ds-1"
      template={opts.template ?? CUSTOM_TEMPLATE}
      service={opts.service ?? 'my-svc'}
    />
  );
  return dispatch;
}

describe('CustomPromqlEditor — simple view', () => {
  it('shows a plain-language summary and read-only query, builder collapsed, for a template default', () => {
    // apm template default for service=frontend → simple view, Advanced closed.
    const def = customPromql({
      goodQuery:
        'sum(request{service="frontend",remoteService="",namespace="span_derived"}) - sum(fault{service="frontend",remoteService="",namespace="span_derived"})',
      totalQuery: 'sum(request{service="frontend",remoteService="",namespace="span_derived"})',
    });
    renderEditor(def, jest.fn(), { template: APM_TEMPLATE, service: 'frontend' });
    expect(screen.getByTestId('slosWizardSliSummary')).toHaveTextContent('frontend');
    expect(screen.getByTestId('slosWizardSliSummaryQuery')).toBeInTheDocument();
    // Advanced accordion is collapsed (EuiAccordion keeps children mounted but
    // hidden) — assert the open state via aria-expanded on its button.
    const advancedBtn = screen
      .getByTestId('slosWizardSliAdvanced')
      .querySelector('button[aria-expanded]');
    expect(advancedBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens Advanced automatically when the query is not the template default', () => {
    // A hand-edited query (≠ template default) → Advanced auto-opens.
    const edited = customPromql({
      goodQuery: 'sum(rate(custom[5m]))',
      totalQuery: 'sum(rate(custom[5m]))',
    });
    renderEditor(edited, jest.fn(), { template: APM_TEMPLATE, service: 'frontend' });
    expect(screen.getByTestId('slosWizardCustomPromqlGoodPicker')).toBeInTheDocument();
  });
});

describe('CustomPromqlEditor — Ratio / Advanced', () => {
  it('shows Success + Total metric pickers in Ratio mode', () => {
    renderEditor();
    expect(screen.getByTestId('slosWizardCustomPromqlGoodPicker')).toBeInTheDocument();
    expect(screen.getByTestId('slosWizardCustomPromqlTotalPicker')).toBeInTheDocument();
    // No raw error-ratio textarea in Ratio mode.
    expect(screen.queryByTestId('slosWizardCustomPromqlRaw')).toBeNull();
  });

  it('wraps a picked metric in sum(rate(...)) implicitly', () => {
    const dispatch = renderEditor();
    const picker = screen.getByTestId('slosWizardCustomPromqlGoodPicker');
    fireEvent.click(within(picker).getByTestId('comboBoxToggleListButton'));
    fireEvent.click(screen.getByRole('option', { name: 'http_requests_total' }));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setCustomPromql',
      patch: { goodQuery: 'sum(rate(http_requests_total[5m]))' },
    });
  });

  it('hydrates the picker preview from an existing ratio metric', () => {
    renderEditor(customPromql({ goodQuery: 'sum(rate(http_requests_total[5m]))' }));
    const picker = screen.getByTestId('slosWizardCustomPromqlGoodPicker');
    expect(picker).toBeInTheDocument();
    // Scope to the builder's own preview (the query also appears in the
    // top-level simple-view summary).
    expect(within(picker).getByTestId('slosWizardMetricPreview')).toHaveTextContent(
      'sum(rate(http_requests_total[5m]))'
    );
  });

  it('label filters are progressive disclosure (hidden until added)', () => {
    renderEditor();
    const picker = screen.getByTestId('slosWizardCustomPromqlGoodPicker');
    // No filter row initially.
    expect(within(picker).queryByTestId('slosWizardMetricFilter-0')).toBeNull();
    fireEvent.click(within(picker).getByTestId('slosWizardMetricAddFilter'));
    expect(within(picker).getByTestId('slosWizardMetricFilter-0')).toBeInTheDocument();
  });

  it('renders the APM good = request - fault default in the builder (not raw text)', () => {
    // Regression for the apm-service-availability template: a difference of two
    // sums must hydrate into the builder with a subtract term, keeping
    // dropdowns — not collapse to a textarea.
    renderEditor(
      customPromql({
        goodQuery: 'sum(request{service="frontend"}) - sum(fault{service="frontend"})',
      })
    );
    const picker = screen.getByTestId('slosWizardCustomPromqlGoodPicker');
    expect(picker).toBeInTheDocument();
    // Both the main and the subtract metric term editors are present.
    expect(within(picker).getByTestId('slosWizardMetricTerm')).toBeInTheDocument();
    expect(within(picker).getByTestId('slosWizardSubtractMetricTerm')).toBeInTheDocument();
    // Not a raw textarea.
    expect(screen.queryByTestId('slosWizardCustomPromqlGood')).toBeNull();
  });

  it('adds a subtract term that serializes to metric - metric', () => {
    const dispatch = renderEditor(customPromql({ goodQuery: 'sum(request)' }));
    const picker = screen.getByTestId('slosWizardCustomPromqlGoodPicker');
    fireEvent.click(within(picker).getByTestId('slosWizardMetricAddSubtract'));
    // Type a metric into the subtract term's combobox search input.
    const subTerm = within(picker).getByTestId('slosWizardSubtractMetricTerm');
    const input = within(subTerm).getByTestId('comboBoxSearchInput');
    fireEvent.change(input, { target: { value: 'fault' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setCustomPromql',
      patch: { goodQuery: 'sum(request) - sum(fault)' },
    });
  });

  it('falls back to a raw textarea when a ratio metric is too complex to model', () => {
    renderEditor(customPromql({ goodQuery: 'sum(rate(a[5m])) / sum(rate(b[5m]))' }));
    // Not representable as a single metric → raw textarea, no picker.
    expect(screen.getByTestId('slosWizardCustomPromqlGood')).toBeInTheDocument();
    expect(screen.queryByTestId('slosWizardCustomPromqlGoodPicker')).toBeNull();
  });

  it('switching to Advanced shows the raw error-ratio textarea', () => {
    const dispatch = jest.fn();
    renderEditor(customPromql({ mode: 'raw' }), dispatch);
    expect(screen.getByTestId('slosWizardCustomPromqlRaw')).toBeInTheDocument();
    // Ratio pickers absent in Advanced mode.
    expect(screen.queryByTestId('slosWizardCustomPromqlGoodPicker')).toBeNull();
  });

  it('toggling the mode dispatches the new customExpr mode', () => {
    const dispatch = renderEditor();
    // EuiButtonGroup stamps each option's id as its data-test-subj; the
    // Advanced option maps to the `raw` customExpr mode.
    fireEvent.click(screen.getByTestId('raw'));
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'setCustomPromql',
      patch: { mode: 'raw' },
    });
  });
});
