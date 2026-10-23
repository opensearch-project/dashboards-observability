/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Per-action notification throttle controls in PplTriggersSection: toggle,
 * conditional "Only send every N minute(s)" field, value parsing, validation
 * error, and the new-action defaults.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { PplTriggersSection } from '../ppl_triggers';
import { PplActionForm, PplTriggerForm } from '../../create_monitor_types';

jest.mock('../destination_picker', () => ({
  DestinationPicker: () => <div data-test-subj="mockDestinationPicker" />,
}));

const action = (overrides: Partial<PplActionForm> = {}): PplActionForm => ({
  id: 'a1',
  name: 'action_1',
  destinationId: 'chan-1',
  subject: '',
  message: 'm',
  throttleEnabled: false,
  throttleValue: 10,
  ...overrides,
});

const trigger = (actions: PplActionForm[]): PplTriggerForm => ({
  id: 't1',
  name: 'trigger-1',
  severity: '3',
  type: 'number_of_results',
  numResultsCondition: '>=',
  numResultsValue: 1,
  customCondition: '',
  actions,
});

const renderSection = (actions: PplActionForm[], hasSubmitted = false) => {
  const onChange = jest.fn();
  render(
    <PplTriggersSection
      dsId="ds-1"
      triggers={[trigger(actions)]}
      onChange={onChange}
      hasSubmitted={hasSubmitted}
    />
  );
  return onChange;
};

const byTestSubj = (s: string) => document.querySelector(`[data-test-subj="${s}"]`);
const firstAction = (onChange: jest.Mock) => onChange.mock.calls[0][0][0].actions[0];

describe('PplTriggersSection — throttle', () => {
  it('hides the throttle value field until throttling is enabled', () => {
    renderSection([action()]);
    expect(byTestSubj('alertManagerPplActionThrottleEnabled')).toBeInTheDocument();
    expect(byTestSubj('alertManagerPplActionThrottleValue')).toBeNull();
  });

  it('toggling the checkbox updates the action', () => {
    const onChange = renderSection([action()]);
    fireEvent.click(byTestSubj('alertManagerPplActionThrottleEnabled')!);
    expect(firstAction(onChange)).toMatchObject({ id: 'a1', throttleEnabled: true });
  });

  it('shows the value field with a minutes suffix when enabled', () => {
    renderSection([action({ throttleEnabled: true, throttleValue: 15 })]);
    const input = byTestSubj('alertManagerPplActionThrottleValue') as HTMLInputElement;
    expect(input.value).toBe('15');
    expect(screen.getByText('minute(s)')).toBeInTheDocument();
    expect(screen.getByText('Only send every')).toBeInTheDocument();
  });

  it('parses the value as an integer; non-numeric input becomes 0', () => {
    const onChange = renderSection([action({ throttleEnabled: true })]);
    const input = byTestSubj('alertManagerPplActionThrottleValue')!;
    fireEvent.change(input, { target: { value: '25' } });
    expect(firstAction(onChange).throttleValue).toBe(25);
    fireEvent.change(input, { target: { value: '' } });
    expect(onChange.mock.calls[1][0][0].actions[0].throttleValue).toBe(0);
  });

  it('shows the validation error only after submit and only for invalid values', () => {
    const { unmount } = render(
      <PplTriggersSection
        dsId="ds-1"
        triggers={[trigger([action({ throttleEnabled: true, throttleValue: 0 })])]}
        onChange={jest.fn()}
      />
    );
    expect(screen.queryByText(/whole number of minutes/)).toBeNull();
    unmount();
    renderSection([action({ throttleEnabled: true, throttleValue: 0 })], true);
    expect(screen.getByText(/Must be a whole number of minutes ≥ 1/)).toBeInTheDocument();
  });

  it('does not flag a valid value or a disabled throttle', () => {
    renderSection(
      [
        action({ id: 'a1', throttleEnabled: true, throttleValue: 5 }),
        action({ id: 'a2', throttleEnabled: false, throttleValue: 0 }),
      ],
      true
    );
    expect(screen.queryByText(/whole number of minutes/)).toBeNull();
  });

  it('new actions default to throttle off with a 10-minute value', () => {
    const onChange = renderSection([]);
    fireEvent.click(screen.getByText('Add another action'));
    expect(firstAction(onChange)).toMatchObject({ throttleEnabled: false, throttleValue: 10 });
  });

  it('no longer shows the leaked datarows setting name in the trigger help text', () => {
    renderSection([]);
    expect(screen.queryByText(/ppl_query_results_max_datarows/)).toBeNull();
  });
});
