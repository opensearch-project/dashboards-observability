/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';
import { TimeRangePicker } from '../time_range_picker';

// Capture the props EuiSuperDatePicker receives so the test can fire onTimeChange.
const mockPickerProps: { current: any } = { current: null };
jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiSuperDatePicker: (props: any) => {
    mockPickerProps.current = props;
    return null;
  },
}));

describe('TimeRangePicker', () => {
  const timeRange = { from: 'now-15m', to: 'now' };

  it('passes a new range to onChange', () => {
    const onChange = jest.fn();
    const onRefresh = jest.fn();
    render(<TimeRangePicker timeRange={timeRange} onChange={onChange} onRefresh={onRefresh} />);

    mockPickerProps.current.onTimeChange({ start: 'now-1h', end: 'now' });

    expect(onChange).toHaveBeenCalledWith({ from: 'now-1h', to: 'now' });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('treats re-picking the current range as a refresh', () => {
    const onChange = jest.fn();
    const onRefresh = jest.fn();
    render(<TimeRangePicker timeRange={timeRange} onChange={onChange} onRefresh={onRefresh} />);

    mockPickerProps.current.onTimeChange({ start: 'now-15m', end: 'now' });

    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
