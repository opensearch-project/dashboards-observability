/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('echarts', () => ({
  init: jest.fn(() => ({ setOption: jest.fn(), resize: jest.fn(), dispose: jest.fn() })),
}));

global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  disconnect: jest.fn(),
  unobserve: jest.fn(),
}));

import { CreateLogsMonitor } from '../create_logs_monitor';

describe('CreateLogsMonitor', () => {
  it('renders flyout with form title', () => {
    render(<CreateLogsMonitor onCancel={jest.fn()} onSave={jest.fn()} />);
    expect(document.body.textContent).toContain('Monitor');
  });

  it('calls onCancel when flyout close is clicked', () => {
    const onCancel = jest.fn();
    render(<CreateLogsMonitor onCancel={onCancel} onSave={jest.fn()} />);
    const closeBtn = document.querySelector('[data-test-subj="euiFlyoutCloseButton"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalled();
  });
});
