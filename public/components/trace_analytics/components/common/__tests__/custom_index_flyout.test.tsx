/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { useToast } from '../../../../common/toast';
import { CustomIndexFlyout } from '../custom_index_flyout';
import { TraceSettings } from '../helper_functions';

// Mock TraceSettings functions
jest.mock('../helper_functions', () => ({
  TraceSettings: {
    getCustomSpanIndex: jest.fn(),
    getCustomServiceIndex: jest.fn(),
    getCorrelatedLogsIndex: jest.fn(),
    getCorrelatedLogsFieldMappings: jest.fn(),
    getCustomModeSetting: jest.fn(),
    setCustomSpanIndex: jest.fn(),
    setCustomServiceIndex: jest.fn(),
    setCorrelatedLogsIndex: jest.fn(),
    setCorrelatedLogsFieldMappings: jest.fn(),
    setCustomModeSetting: jest.fn(),
  },
}));

// Mock the toast hook
jest.mock('../../../../common/toast', () => ({
  useToast: jest.fn(),
}));

describe('CustomIndexFlyout test', () => {
  let setIsFlyoutVisibleMock: jest.Mock;
  let setToastMock: jest.Mock;

  beforeEach(() => {
    setIsFlyoutVisibleMock = jest.fn();
    setToastMock = jest.fn();

    (useToast as jest.Mock).mockReturnValue({ setToast: setToastMock });

    (TraceSettings.getCustomSpanIndex as jest.Mock).mockReturnValue('span-index-1');
    (TraceSettings.getCustomServiceIndex as jest.Mock).mockReturnValue('service-index-1');
    (TraceSettings.getCorrelatedLogsIndex as jest.Mock).mockReturnValue('logs-index-1');
    (TraceSettings.getCorrelatedLogsFieldMappings as jest.Mock).mockReturnValue({
      serviceName: 'service_field',
      spanId: 'span_field',
      timestamp: 'timestamp_field',
    });
    (TraceSettings.getCustomModeSetting as jest.Mock).mockReturnValue(false);
  });

  it('renders flyout when isFlyoutVisible is true', () => {
    render(
      <CustomIndexFlyout isFlyoutVisible={true} setIsFlyoutVisible={setIsFlyoutVisibleMock} />
    );

    expect(screen.getByText('Manage custom source')).toBeInTheDocument();
    expect(screen.getByLabelText('spanIndices')).toHaveValue('span-index-1');
    expect(screen.getByLabelText('serviceIndices')).toHaveValue('service-index-1');
    expect(screen.getByLabelText('logsIndices')).toHaveValue('logs-index-1');
    expect(screen.getByLabelText('Enable custom source as default mode')).not.toBeChecked();
  });

  it('updates span indices when input changes', () => {
    render(
      <CustomIndexFlyout isFlyoutVisible={true} setIsFlyoutVisible={setIsFlyoutVisibleMock} />
    );

    const input = screen.getByLabelText('Custom span indices');
    fireEvent.change(input, { target: { value: 'new-span-index' } });

    expect(input).toHaveValue('new-span-index');
  });

  it('calls TraceSettings set functions when save button is clicked', async () => {
    render(
      <CustomIndexFlyout isFlyoutVisible={true} setIsFlyoutVisible={setIsFlyoutVisibleMock} />
    );

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(TraceSettings.setCustomSpanIndex).toHaveBeenCalledWith('span-index-1');
      expect(TraceSettings.setCustomServiceIndex).toHaveBeenCalledWith('service-index-1');
      expect(TraceSettings.setCorrelatedLogsIndex).toHaveBeenCalledWith('logs-index-1');
      expect(TraceSettings.setCorrelatedLogsFieldMappings).toHaveBeenCalled();
      expect(TraceSettings.setCustomModeSetting).toHaveBeenCalledWith(false);
      expect(setToastMock).toHaveBeenCalledWith(
        'Updated trace analytics settings successfully',
        'success'
      );
    });
  });

  it('shows error toast if save settings fail', async () => {
    (TraceSettings.setCustomSpanIndex as jest.Mock).mockRejectedValue(new Error('Save error'));

    render(
      <CustomIndexFlyout isFlyoutVisible={true} setIsFlyoutVisible={setIsFlyoutVisibleMock} />
    );

    const saveButton = screen.getByText('Save');
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(setToastMock).toHaveBeenCalledWith(
        'Failed to update trace analytics settings',
        'danger'
      );
    });
  });

  it('closes the flyout when Close button is clicked', () => {
    render(
      <CustomIndexFlyout isFlyoutVisible={true} setIsFlyoutVisible={setIsFlyoutVisibleMock} />
    );

    const closeButton = screen.getByText('Close');
    fireEvent.click(closeButton);

    expect(setIsFlyoutVisibleMock).toHaveBeenCalledWith(false);
  });
});
