/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import thunk from 'redux-thunk';
import { SELECTED_PANELS_OPTIONS } from '../../../../../../test/event_analytics_constants';
// eslint-disable-next-line jest/no-mocks-import
import httpClientMock from '../../../../../../test/__mocks__/httpClientMock';
import { coreRefs } from '../../../../../framework/core_refs';
import { rootReducer } from '../../../../../framework/redux/reducers';
import SavedObjects from '../../../../../services/saved_objects/event_analytics/saved_objects';
import { SavePanel } from '../save_panel';

describe('Saved query table component', () => {
  const store = createStore(rootReducer, applyMiddleware(thunk));
  coreRefs.savedObjectsClient.find = jest.fn(() =>
    Promise.resolve({
      savedObjects: [],
      then: () => Promise.resolve(),
    })
  );

  it('Renders saved query table', async () => {
    const handleNameChange = jest.fn();
    const handleOptionChange = jest.fn();
    const setMetricLabel = jest.fn();
    const savedObjects = new SavedObjects(httpClientMock);

    render(
      <Provider store={store}>
        <SavePanel
          selectedOptions={SELECTED_PANELS_OPTIONS}
          handleNameChange={handleNameChange}
          handleOptionChange={handleOptionChange}
          savedObjects={savedObjects}
          savePanelName={'Count by depature'}
          showOptionList={true}
          curVisId={'line'}
          spanValue={false}
          setSubType={'metric'}
          setMetricMeasure={'hours (h)'}
          setMetricLabel={setMetricLabel}
          metricMeasure={'hours (h)'}
          metricChecked={true}
        />
      </Provider>
    );

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
