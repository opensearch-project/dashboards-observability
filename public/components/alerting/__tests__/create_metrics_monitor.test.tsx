/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react';

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

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

import { CreateMetricsMonitor } from '../create_metrics_monitor';

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

    // Fill in required fields: monitorName
    const nameInput = document.querySelector('input[aria-label="Rule name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'my-test-rule' } });

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
      operator: '>',
      threshold: expect.any(Number),
      forDuration: expect.any(String),
      evaluationInterval: expect.any(String),
      enabled: true,
      groupName: 'my-test-rule',
    });
    expect(body).toHaveProperty('labels');
    expect(body).toHaveProperty('annotations');

    // Should call onSave and show success toast
    expect(onSave).toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });
});
