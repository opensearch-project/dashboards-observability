/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { ShortDate } from '@elastic/eui';
import { waitFor } from '@testing-library/react';
import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import toJson from 'enzyme-to-json';
import React from 'react';
import httpClientMock from '../../../../../../test/__mocks__/httpClientMock';
import PPLService from '../../../../../services/requests/ppl';
import { VisaulizationFlyout } from '../visualization_flyout';

describe('Visualization Flyout Component', () => {
  configure({ adapter: new Adapter() });

  it('renders add visualization Flyout', async () => {
    const panelId = '';
    const pplFilterValue = '';
    const start: ShortDate = 'now-15m';
    const end: ShortDate = 'now';
    const setToast = jest.fn();
    const closeFlyout = jest.fn();
    const setPanelVisualizations = jest.fn();
    const pplService = new PPLService(httpClientMock);
    const isFlyoutReplacement = false;

    const wrapper = mount(
      <VisaulizationFlyout
        panelId={panelId}
        pplFilterValue={pplFilterValue}
        start={start}
        end={end}
        setToast={setToast}
        closeFlyout={closeFlyout}
        setPanelVisualizations={setPanelVisualizations}
        http={httpClientMock}
        pplService={pplService}
        isFlyoutReplacement={isFlyoutReplacement}
      />
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

  it('renders replace visualization Flyout', async () => {
    const panelId = 'oiuccXwBYVazWqOO1e06';
    const pplFilterValue = "where Carrier='OpenSearch-Air'";
    const start: ShortDate = '2011-08-11T01:23:45.678Z';
    const end: ShortDate = '2011-08-12T01:23:45.678Z';
    const setToast = jest.fn();
    const closeFlyout = jest.fn();
    const setPanelVisualizations = jest.fn();
    const pplService = new PPLService(httpClientMock);
    const isFlyoutReplacement = true;
    const replaceVisualizationId = '';

    const wrapper = mount(
      <VisaulizationFlyout
        panelId={panelId}
        pplFilterValue={pplFilterValue}
        start={start}
        end={end}
        setToast={setToast}
        closeFlyout={closeFlyout}
        setPanelVisualizations={setPanelVisualizations}
        http={httpClientMock}
        pplService={pplService}
        isFlyoutReplacement={isFlyoutReplacement}
        replaceVisualizationId={replaceVisualizationId}
      />
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
