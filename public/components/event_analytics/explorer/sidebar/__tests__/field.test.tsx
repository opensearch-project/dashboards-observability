/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { Field } from '../field';
import { AGENT_FIELD } from '../../../../../../test/event_analytics_constants';
import { applyMiddleware, createStore } from 'redux';
import { rootReducer } from '../../../../../framework/redux/reducers';
import thunk from 'redux-thunk';
import { Provider } from 'react-redux';
import { DEFAULT_DATA_SOURCE_TYPE } from '../../../../../../common/constants/data_sources';

describe('Field component', () => {
  configure({ adapter: new Adapter() });

  it('Renders a sidebar field', async () => {
    const onToggleField = jest.fn();
    const handleOverrideTimestamp = jest.fn();
    const selectedTimestamp = 'timestamp';
    const store = createStore(rootReducer, applyMiddleware(thunk));

    const wrapper = mount(
      <Provider store={store}>
        <Field
          field={AGENT_FIELD}
          selectedTimestamp={selectedTimestamp}
          handleOverrideTimestamp={handleOverrideTimestamp}
          isOverridingTimestamp={false}
          isFieldToggleButtonDisabled={false}
          showTimestampOverrideButton={true}
          onToggleField={onToggleField}
          selected
          showToggleButton={true}
          tabId={DEFAULT_DATA_SOURCE_TYPE}
        />
      </Provider>
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});
