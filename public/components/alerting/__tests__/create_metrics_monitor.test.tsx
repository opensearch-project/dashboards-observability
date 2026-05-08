/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('echarts', () => ({
  init: jest.fn(() => ({ setOption: jest.fn(), resize: jest.fn(), dispose: jest.fn() })),
}));

jest.mock('../promql_editor', () => ({
  PromQLEditor: ({ value }: { value: string }) => (
    <textarea data-test-subj="promql-mock" defaultValue={value} />
  ),
}));

jest.mock('../metric_browser', () => ({
  MetricBrowser: () => <div data-test-subj="metric-browser-mock" />,
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
    expect(document.body.textContent).toContain('Monitor');
  });

  it('calls onCancel when flyout close is clicked', () => {
    const onCancel = jest.fn();
    render(<CreateMetricsMonitor onCancel={onCancel} onSave={jest.fn()} />);
    const closeBtn = document.querySelector('[data-test-subj="euiFlyoutCloseButton"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
  });
});
