/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { ConfigPanel } from '../config_panel';
import {
  TEST_VISUALIZATIONS_DATA,
  EXPLORER_VISUALIZATIONS,
} from '../../../../../../../test/event_analytics_constants';
import { TabContext } from '../../../../hooks';
import PPLService from '../../../../../../services/requests/ppl';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../../../test/__mocks__/httpClientMock';

jest.mock('!!raw-loader!./default.layout.spec.hjson', () => 'MOCK HJSON STRING');

describe('Config panel component', () => {
  it('Renders config panel with visualization data', async () => {
    const setCurVisId = jest.fn();
    const tabId = 'query-panel-1';
    const curVisId = 'bar';
    const pplService = new PPLService(httpClientMock);
    const mockChangeIsValidConfigOptionState = jest.fn();

    render(
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

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
