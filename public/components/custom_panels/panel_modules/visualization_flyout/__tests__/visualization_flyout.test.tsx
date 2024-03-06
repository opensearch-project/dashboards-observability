/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import PPLService from '../../../../../services/requests/ppl';
import React from 'react';
import { VisaulizationFlyout } from '../visualization_flyout';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../../test/__mocks__/httpClientMock';
import { ShortDate } from '@elastic/eui';
import { cleanup } from '@testing-library/react';
import { SavedObjectsActions } from '../../../../../../public/services/saved_objects/saved_object_client/saved_objects_actions';
import { sampleSavedVisualization } from '../../../../../../test/panels_constants';

describe('Visualization Flyout Component', () => {
  configure({ adapter: new Adapter() });

  afterEach(() => {
    cleanup();
  });

  it('renders add visualization Flyout', () => {
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

    expect(wrapper).toMatchSnapshot();
  });

  it('renders replace visualization Flyout', () => {
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

    SavedObjectsActions.getBulk = jest.fn(() =>
      Promise.resolve({
        observabilityObjectList: [sampleSavedVisualization],
        then: () => Promise.resolve(),
      })
    );

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

    wrapper.find('[data-test-subj="addFlyoutButton"]').first().simulate('click');

    expect(wrapper).toMatchSnapshot();
  });
});
