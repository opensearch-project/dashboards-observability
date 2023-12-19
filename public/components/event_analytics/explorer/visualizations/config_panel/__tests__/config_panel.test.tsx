/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import httpClientMock from '../../../../../../../test/__mocks__/httpClientMock';
import {
  EXPLORER_VISUALIZATIONS,
  TEST_VISUALIZATIONS_DATA,
} from '../../../../../../../test/event_analytics_constants';
import PPLService from '../../../../../../services/requests/ppl';
import { TabContext } from '../../../../hooks';
import { ConfigPanel } from '../config_panel';

jest.mock('!!raw-loader!./default.layout.spec.hjson', () => 'MOCK HJSON STRING');

describe('Config panel component', () => {
  configure({ adapter: new Adapter() });

  it('Renders config panel with visualization data', async () => {
    const setCurVisId = jest.fn();
    const tabId = 'query-panel-1';
    const curVisId = 'bar';
    const pplService = new PPLService(httpClientMock);
    const mockChangeIsValidConfigOptionState = jest.fn();

    const wrapper = mount(
      <TabContext.Provider
        value={{
          tabId,
          curVisId,
          dispatch: jest.fn(),
          changeVisualizationConfig: jest.fn(),
          explorerVisualizations: EXPLORER_VISUALIZATIONS,
          setToast: jest.fn(),
          pplService,
        }}
      >
        <ConfigPanel
          visualizations={TEST_VISUALIZATIONS_DATA}
          setCurVisId={setCurVisId}
          changeIsValidConfigOptionState={mockChangeIsValidConfigOptionState}
        />
      </TabContext.Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(
        toJson(wrapper, {
          mode: 'deep',
        })
      ).toMatchSnapshot();
    });
  });
});
