/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import {
  SetupIntegrationDataSource,
  SetupIntegrationExistingTable,
  SetupIntegrationMetadata,
  SetupIntegrationNewTable,
  SetupIntegrationStepsPage,
} from '../setup_integration';

const TEST_CONFIG = {
  instanceName: 'Test Instance Name',
  useExisting: true,
  dataSourceName: 'Test Datasource Name',
  dataSourceDescription: 'Test Datasource Description',
  dataSourceFileType: 'json',
  dataSourceLocation: 'ss4o_logs-test-new-location',
  existingDataSourceName: 'ss4o_logs-test-existing-location',
};

describe('Integration Setup Page Test', () => {
  configure({ adapter: new Adapter() });

  it('Renders integration setup page as expected', async () => {
    const wrapper = mount(<SetupIntegrationStepsPage />);

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the metadata form as expected', async () => {
    const wrapper = mount(
      <SetupIntegrationMetadata name={TEST_CONFIG.instanceName} setName={() => {}} />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the data source form as expected', async () => {
    const wrapper = mount(
      <SetupIntegrationDataSource
        config={TEST_CONFIG}
        updateConfig={() => {}}
        showDataModal={false}
        setShowDataModal={() => {}}
        tableDetected={false}
        setTableDetected={() => {}}
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the new table form as expected', async () => {
    const wrapper = mount(
      <SetupIntegrationNewTable config={TEST_CONFIG} updateConfig={() => {}} />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });

  it('Renders the existing table form as expected', async () => {
    const wrapper = mount(
      <SetupIntegrationExistingTable
        config={TEST_CONFIG}
        updateConfig={() => {}}
        showDataModal={false}
        setShowDataModal={() => {}}
      />
    );

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});
