/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { ServiceView } from '..';

jest.mock('../../../../../../test/__mocks__/coreMocks', () => ({
  coreStartMock: {
    chrome: { setBreadcrumbs: jest.fn() },
    http: { post: jest.fn() },
  },
}));

jest.mock('react-router-dom', () => ({
  useLocation: jest.fn().mockReturnValue({
    pathname: '/services',
    search: '?serviceId=test-id',
    hash: '',
    state: null,
    key: '',
  }),
  useHistory: jest.fn(),
}));

describe('Service view component', () => {
  const { coreStartMock } = jest.requireMock('../../../../../../test/__mocks__/coreMocks');

  const defaultProps = {
    serviceName: 'order',
    chrome: coreStartMock.chrome,
    appConfigs: [],
    parentBreadcrumbs: [{ text: 'test', href: 'test#/' }],
    http: coreStartMock.http,
    query: '',
    setQuery: jest.fn(),
    filters: [],
    setFilters: jest.fn(),
    startTime: 'now-5m',
    setStartTime: jest.fn(),
    endTime: 'now',
    setEndTime: jest.fn(),
    addFilter: jest.fn(),
    mode: 'data_prepper',
    dataSourceMDSId: [{ id: '', label: '' }],
  };

  it('renders service view', async () => {
    render(<ServiceView {...defaultProps} />);
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
