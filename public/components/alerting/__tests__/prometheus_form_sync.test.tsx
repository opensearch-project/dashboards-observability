/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Tests for bidirectional sync between threshold.forDuration and pendingPeriod
 * in the Prometheus form section.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrometheusFormSection } from '../create_monitor/prometheus_form_section';
import type { PrometheusFormState } from '../create_monitor/create_monitor_types';

// Mock dependencies that PrometheusFormSection uses
jest.mock('../promql_editor', () => ({
  PromQLEditor: () => <div data-test-subj="promql-editor" />,
}));
jest.mock('../metric_browser', () => ({
  MetricBrowser: () => <div data-test-subj="metric-browser" />,
}));
jest.mock('../monitor_form_components', () => ({
  LabelEditor: () => <div data-test-subj="label-editor" />,
  AnnotationEditor: () => <div data-test-subj="annotation-editor" />,
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

describe('PrometheusFormSection — duration sync', () => {
  it('changing forDuration in threshold syncs to pendingPeriod', () => {
    const onUpdate = jest.fn();

    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // Find the "For Duration" select (in the threshold panel)
    const forDurationSelect = screen.getByLabelText('For duration');
    fireEvent.change(forDurationSelect, { target: { value: '2m' } });

    // Should update both threshold.forDuration AND pendingPeriod
    expect(onUpdate).toHaveBeenCalledWith(
      'threshold',
      expect.objectContaining({ forDuration: '2m' })
    );
    expect(onUpdate).toHaveBeenCalledWith('pendingPeriod', '2m');
  });

  it('changing pendingPeriod in eval settings syncs to threshold.forDuration', () => {
    const onUpdate = jest.fn();

    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    // Find the "Pending Period" select (in eval settings panel)
    const pendingPeriodSelect = screen.getByLabelText('Pending period');
    fireEvent.change(pendingPeriodSelect, { target: { value: '10m' } });

    // Should update both pendingPeriod AND threshold.forDuration
    expect(onUpdate).toHaveBeenCalledWith('pendingPeriod', '10m');
    expect(onUpdate).toHaveBeenCalledWith(
      'threshold',
      expect.objectContaining({ forDuration: '10m' })
    );
  });

  it('changing evaluationInterval does not affect forDuration', () => {
    const onUpdate = jest.fn();

    render(
      <PrometheusFormSection
        form={baseForm}
        onUpdate={onUpdate}
        validationErrors={{}}
        hasSubmitted={false}
      />
    );

    const evalIntervalSelect = screen.getByLabelText('Evaluation interval');
    fireEvent.change(evalIntervalSelect, { target: { value: '2m' } });

    // Should only update evaluationInterval
    expect(onUpdate).toHaveBeenCalledWith('evaluationInterval', '2m');
    expect(onUpdate).not.toHaveBeenCalledWith('pendingPeriod', expect.anything());
    expect(onUpdate).not.toHaveBeenCalledWith('threshold', expect.anything());
  });
});
