/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SuggestingComboBox } from '../suggesting_combo_box';

function getSearchInput(testSubj: string): HTMLElement {
  return screen.getByTestId(testSubj).querySelector('[data-test-subj="comboBoxSearchInput"]')!;
}

describe('SuggestingComboBox', () => {
  it('offers the provided suggestions as options', () => {
    render(
      <SuggestingComboBox
        value=""
        onChange={jest.fn()}
        suggestions={['payments', 'checkout']}
        data-test-subj="svc"
      />
    );
    fireEvent.click(screen.getByTestId('comboBoxToggleListButton'));
    const labels = screen.getAllByRole('option').map((o) => o.textContent);
    expect(labels).toEqual(expect.arrayContaining(['payments', 'checkout']));
  });

  it('emits a picked suggestion', () => {
    const onChange = jest.fn();
    render(
      <SuggestingComboBox
        value=""
        onChange={onChange}
        suggestions={['payments']}
        data-test-subj="svc"
      />
    );
    fireEvent.click(screen.getByTestId('comboBoxToggleListButton'));
    fireEvent.click(screen.getByRole('option', { name: 'payments' }));
    expect(onChange).toHaveBeenCalledWith('payments');
  });

  it('accepts free text not in the suggestion list', () => {
    const onChange = jest.fn();
    render(
      <SuggestingComboBox
        value=""
        onChange={onChange}
        suggestions={['payments']}
        data-test-subj="svc"
      />
    );
    const input = getSearchInput('svc');
    fireEvent.change(input, { target: { value: 'brand-new-service' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('brand-new-service');
  });

  it('renders the current value as the selected chip even when not in suggestions', () => {
    render(
      <SuggestingComboBox
        value="legacy-svc"
        onChange={jest.fn()}
        suggestions={['payments']}
        data-test-subj="svc"
      />
    );
    expect(screen.getByText('legacy-svc')).toBeInTheDocument();
  });

  it('trims free text before emitting', () => {
    const onChange = jest.fn();
    render(
      <SuggestingComboBox value="" onChange={onChange} suggestions={[]} data-test-subj="svc" />
    );
    const input = getSearchInput('svc');
    fireEvent.change(input, { target: { value: '  spaced  ' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('spaced');
  });
});
