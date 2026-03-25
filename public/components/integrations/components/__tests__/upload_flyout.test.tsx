/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { IntegrationUploadFlyout, IntegrationUploadPicker } from '../upload_flyout';

describe('Integration Upload Flyout', () => {
  it('Renders integration upload flyout as expected', async () => {
    render(<IntegrationUploadFlyout onClose={() => {}} />);

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the clean integration picker as expected', async () => {
    render(
      <IntegrationUploadPicker
        isInvalid={true}
        setIsInvalid={(_) => {}}
        onFileSelected={(_) => {}}
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
