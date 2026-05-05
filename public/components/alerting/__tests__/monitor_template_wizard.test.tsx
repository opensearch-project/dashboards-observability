/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { MonitorTemplateWizard } from '../monitor_template_wizard';

describe('MonitorTemplateWizard', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders scanning step initially', () => {
    render(<MonitorTemplateWizard onClose={jest.fn()} onCreateMonitors={jest.fn()} />);
    // Flyout renders in portal — query document.body
    expect(document.body.textContent).toContain('Scanning');
  });

  it('calls onClose when close button is clicked', () => {
    const onClose = jest.fn();
    render(<MonitorTemplateWizard onClose={onClose} onCreateMonitors={jest.fn()} />);
    const closeBtn = document.querySelector('[data-test-subj="euiFlyoutCloseButton"]');
    expect(closeBtn).not.toBeNull();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
