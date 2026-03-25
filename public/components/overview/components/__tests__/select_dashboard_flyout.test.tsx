/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Props, SelectDashboardFlyout } from '../select_dashboard_flyout';

const renderSelectDashboardFlyout = (props: Partial<Props> = {}) => {
  const defaultProps: Props = {
    closeFlyout: jest.fn(),
    dashboardsSavedObjects: {},
    reloadPage: jest.fn(),
  };

  return render(<SelectDashboardFlyout {...defaultProps} {...props} />);
};

describe('Select dashboard flyout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render', async () => {
    renderSelectDashboardFlyout();
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
