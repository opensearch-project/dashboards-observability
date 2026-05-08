/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render } from '@testing-library/react';

jest.mock('../../../framework/core_refs', () => ({
  coreRefs: {
    http: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
    core: {
      uiSettings: {
        get: jest.fn((_key: string, defaultValue: unknown) => defaultValue),
      },
    },
  },
}));

jest.mock('../alarms_page', () => ({
  AlarmsPage: (props: Record<string, unknown>) => (
    <div data-test-subj="alarms-page" data-max={props.maxDatasources} />
  ),
}));

import { AlertingHome } from '../home';

describe('AlertingHome', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<AlertingHome />);
    expect(getByTestId('alarms-page')).toBeInTheDocument();
  });

  it('passes maxDatasources clamped to default when uiSettings returns []', () => {
    const { getByTestId } = render(<AlertingHome />);
    expect(getByTestId('alarms-page').getAttribute('data-max')).toBe('5');
  });
});
