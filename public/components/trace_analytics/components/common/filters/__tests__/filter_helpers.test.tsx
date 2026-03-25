/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor, fireEvent } from '@testing-library/react';
import {
  getFilterFields,
  getInvertedOperator,
  getOperatorOptions,
  getValidFilterFields,
  getValueComponent,
} from '../filter_helpers';

describe('Filter helper functions', () => {
  it('returns fields by page', () => {
    const fields = getFilterFields('data_prepper', 'dashboard', []);
    expect(fields).toEqual(['traceGroup', 'serviceName', 'error', 'status.message', 'latency']);
  });

  it('returns valid fields by page', () => {
    const dashboardFields = getValidFilterFields('data_prepper', 'dashboard', [
      'resource.attribute.language',
      'service.attribute@scope',
    ]);
    const servicesFields = getValidFilterFields('data_prepper', 'services', [
      'resource.attribute.language',
      'service.attribute@scope',
    ]);
    expect(dashboardFields).toEqual([
      'traceGroup',
      'serviceName',
      'error',
      'status.message',
      'latency',
      'Latency percentile within trace group',
    ]);
    expect(servicesFields).toEqual([
      'traceGroup',
      'serviceName',
      'error',
      'status.message',
      'latency',
      'resource.attribute.language',
      'service.attribute@scope',
    ]);
  });

  it('returns inverted operators', () => {
    const invertedBetween = getInvertedOperator('is between', true);
    const invertedExist = getInvertedOperator('exists', true);
    const invertedIs = getInvertedOperator('is', true);
    expect(invertedBetween).toEqual('is not between');
    expect(invertedExist).toEqual('does not exist');
    expect(invertedIs).toEqual('is not');
  });

  it('returns operator options by field', () => {
    const options = getOperatorOptions('durationInNanos');
    expect(options).toEqual([
      {
        label: 'is',
      },
      {
        label: 'is not',
      },
      {
        label: 'is between',
      },
      {
        label: 'is not between',
      },
      {
        label: 'exists',
      },
      {
        label: 'does not exist',
      },
    ]);
  });

  it('renders textfield filter', async () => {
    const setValue = jest.fn((_v) => {});
    const { container } = render(getValueComponent('serviceName', 'is', 0, setValue));
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const input = container.querySelector('input');
    fireEvent.change(input, { target: { value: '100' } });
    expect(setValue).toBeCalledWith('100');
  });

  it('renders range field filter', async () => {
    const setValue = jest.fn((_v) => {});
    const { container } = render(
      getValueComponent('latency', 'is not between', { from: '0', to: '100' }, setValue)
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    const inputs = container.querySelectorAll('input');
    fireEvent.change(inputs[0], { target: { value: '50' } });
    expect(setValue).toBeCalledWith({ from: '50', to: '100' });

    fireEvent.change(inputs[1], { target: { value: '200' } });
    expect(setValue).toBeCalledWith({ from: '0', to: '200' });
  });
});
