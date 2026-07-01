/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Cross-template verification: EVERY built-in SLO template must present a
 * type-appropriate simple view AND an Advanced editor. Custom-type templates
 * use the PromQL Ratio/Advanced builder; availability/latency templates use the
 * structured metric editor. This test is parametrized over all 12 templates so
 * a new template (or a regression dropping the Advanced affordance) fails CI.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { SLO_TEMPLATES } from '../../../../../../common/slo/slo_templates';
import { CustomPromqlEditor } from '../custom_promql_editor';
import { StructuredSliEditor } from '../structured_sli_editor';
import { initialState, applyTemplate } from '../wizard_state';

jest.mock('../../../../alerting/hooks/use_prometheus_metadata', () => ({
  usePrometheusMetadata: () => ({
    metricOptions: [],
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

/** Render the SLI editor the wizard would pick for a given template. */
function renderSliEditorFor(templateId: string) {
  const template = SLO_TEMPLATES.find((t) => t.id === templateId)!;
  const state = { ...applyTemplate(initialState(), template), service: 'frontend' };
  if (template.sli.type === 'custom') {
    render(
      <CustomPromqlEditor
        value={state.customPromql}
        errors={{}}
        dispatch={jest.fn()}
        datasourceId="ds-1"
        template={template}
        service={state.service}
      />
    );
    return {
      template,
      summary: 'slosWizardSliSummary',
      summaryQuery: 'slosWizardSliSummaryQuery',
      advanced: 'slosWizardSliAdvanced',
      editable: 'slosWizardCustomPromqlMode',
    };
  }
  render(
    <StructuredSliEditor
      state={state}
      errors={{}}
      dispatch={jest.fn()}
      template={template}
      datasourceId="ds-1"
    />
  );
  return {
    template,
    summary: 'slosWizardStructuredSliSummary',
    summaryQuery: 'slosWizardStructuredSliSummaryQuery',
    advanced: 'slosWizardStructuredSliAdvanced',
    editable: 'slosWizardStructuredSliMetric',
  };
}

describe('SLI editor — every template has simple + Advanced', () => {
  const ALL = SLO_TEMPLATES.map((t) => t.id);

  it('covers all 12 built-in templates', () => {
    expect(ALL).toHaveLength(12);
  });

  it.each(ALL)('template "%s" renders a simple summary and an Advanced accordion', (id) => {
    const { summary, summaryQuery, advanced } = renderSliEditorFor(id);
    expect(screen.getByTestId(summary)).toBeInTheDocument();
    expect(screen.getByTestId(summaryQuery)).toBeInTheDocument();
    expect(screen.getByTestId(advanced).querySelector('button[aria-expanded]')).toBeTruthy();
  });

  it.each(ALL)('template "%s" exposes an editable metric/query in Advanced', (id) => {
    // custom → a Ratio/Advanced mode toggle; structured → a metric picker.
    // Both are mounted inside the accordion regardless of its open state.
    const { editable } = renderSliEditorFor(id);
    expect(screen.getByTestId(editable)).toBeInTheDocument();
  });
});
