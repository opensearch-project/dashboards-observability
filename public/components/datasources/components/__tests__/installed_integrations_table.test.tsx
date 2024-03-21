/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import {
  InstallIntegrationFlyout,
  InstalledIntegrationsTable,
} from '../manage/integrations/installed_integrations_table';
import { TEST_INTEGRATION_SEARCH_RESULTS } from '../../../../../test/constants';

describe('Installed Integrations Table test', () => {
  configure({ adapter: new Adapter() });

  it('Renders the installed integrations table', async () => {
    const wrapper = mount(
      <InstalledIntegrationsTable
        integrations={TEST_INTEGRATION_SEARCH_RESULTS}
        datasourceName="unknown"
        datasourceType="S3GLUE"
      />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('Renders the empty installed integrations table', async () => {
    const wrapper = mount(
      <InstalledIntegrationsTable integrations={[]} datasourceType="S3GLUE" datasourceName="test" />
    );

    expect(wrapper).toMatchSnapshot();
  });

  it('Renders the installed integrations table flyout', async () => {
    const wrapper = mount(
      <InstallIntegrationFlyout
        closeFlyout={() => {}}
        datasourceType="S3GLUE"
        datasourceName="test"
      />
    );

    expect(wrapper).toMatchSnapshot();
  });
});
