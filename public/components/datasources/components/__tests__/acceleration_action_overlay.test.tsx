/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react';
import {
  AccelerationActionOverlay,
  AccelerationActionOverlayProps,
} from '../manage/accelerations/acceleration_action_overlay';
import { skippingIndexAcceleration } from '../../../../../test/datasources';

describe('AccelerationActionOverlay Component Tests', () => {
  let props: AccelerationActionOverlayProps;

  beforeEach(() => {
    props = {
      isVisible: true,
      actionType: 'delete',
      acceleration: skippingIndexAcceleration,
      dataSourceName: 'test-datasource',
      onCancel: jest.fn(),
      onConfirm: jest.fn(),
    };
  });

  it('renders correctly', () => {
    render(<AccelerationActionOverlay {...props} />);
    expect(document.querySelector('.euiOverlayMask')).toBeInTheDocument();
    expect(document.querySelector('.euiModal')).toBeInTheDocument();
    expect(document.body.textContent).toContain('Delete acceleration');
  });

  it('calls onConfirm when confirm button is clicked and confirm is enabled', async () => {
    render(<AccelerationActionOverlay {...props} />);

    if (props.actionType === 'vacuum') {
      const input = document.querySelector('input[type="text"]') as HTMLInputElement;
      if (input) {
        fireEvent.change(input, { target: { value: props.acceleration!.indexName } });
        await waitFor(() => {
          // eslint-disable-next-line jest/no-conditional-expect
          expect(input.value).toBe(props.acceleration!.indexName);
        });
      }
    }

    const deleteButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Delete')
    );
    if (deleteButton) {
      fireEvent.click(deleteButton);
    }

    await waitFor(() => {
      expect(props.onConfirm).toHaveBeenCalled();
    });
  });

  it('calls onCancel when cancel button is clicked', async () => {
    render(<AccelerationActionOverlay {...props} />);

    const cancelButton = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Cancel'
    );
    if (cancelButton) {
      fireEvent.click(cancelButton);
    }

    await waitFor(() => {
      expect(props.onCancel).toHaveBeenCalled();
    });
  });
});
