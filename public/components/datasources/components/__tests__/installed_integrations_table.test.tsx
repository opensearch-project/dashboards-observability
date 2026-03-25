/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import {
  InstallIntegrationFlyout,
  InstalledIntegrationsTable,
} from '../manage/integrations/installed_integrations_table';
import { TEST_INTEGRATION_SEARCH_RESULTS } from '../../../../../test/constants';

describe('Installed Integrations Table test', () => {
  it('Renders the installed integrations table', async () => {
    render(
      <InstalledIntegrationsTable
        integrations={TEST_INTEGRATION_SEARCH_RESULTS}
        datasourceName="unknown"
        datasourceType="S3GLUE"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the empty installed integrations table', async () => {
    render(
      <InstalledIntegrationsTable integrations={[]} datasourceType="S3GLUE" datasourceName="test" />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('Renders the installed integrations table flyout', async () => {
    render(
      <InstallIntegrationFlyout
        closeFlyout={() => {}}
        datasourceType="S3GLUE"
        datasourceName="test"
      />
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
