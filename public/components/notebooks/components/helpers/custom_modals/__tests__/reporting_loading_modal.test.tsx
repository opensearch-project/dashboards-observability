/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render } from '@testing-library/react';
import React from 'react';
import { GenerateReportLoadingModal } from '../reporting_loading_modal';

describe('<GenerateReportLoadingModal /> spec', () => {
  it('renders the component', () => {
    const setShowLoading = jest.fn();
    const utils = render(<GenerateReportLoadingModal setShowLoading={setShowLoading} />);
    expect(document.body).toMatchSnapshot();
    utils.getByTestId('reporting-loading-modal-close-button').click();
    expect(setShowLoading).toBeCalledWith(false);
  });
});
