/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { configure, mount } from 'enzyme';
import Adapter from 'enzyme-adapter-react-16';
import React from 'react';
import { waitFor } from '@testing-library/react';
import { SavedQueryTable } from '../saved_objects_table';
import { SAVED_HISTORIES } from '../../../../../test/event_analytics_constants';

describe('Saved query table component', () => {
  configure({ adapter: new Adapter() });

  it('Renders saved query table', async () => {
    const handleHistoryClick = jest.fn();
    const handleSelectHistory = jest.fn();
    const addSampledata = jest.fn();
    const showDeleteConfirmation = jest.fn();
    const selectedHistories = [];

    const wrapper = mount(
      <SavedQueryTable
        savedHistories={SAVED_HISTORIES}
        handleHistoryClick={handleHistoryClick}
        handleSelectHistory={handleSelectHistory}
        isTableLoading={false}
        selectedHistories={selectedHistories}
        addSampledata={addSampledata}
        showDeleteConfirmation={showDeleteConfirmation}
      />
    );

    wrapper.update();

    await waitFor(() => {
      expect(wrapper).toMatchSnapshot();
    });
  });
});
