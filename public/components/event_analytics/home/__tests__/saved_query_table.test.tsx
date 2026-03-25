/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { SavedQueryTable } from '../saved_objects_table';
import { SAVED_HISTORIES } from '../../../../../test/event_analytics_constants';

describe('Saved query table component', () => {
  it('Renders saved query table', async () => {
    const handleHistoryClick = jest.fn();
    const handleSelectHistory = jest.fn();
    const addSampledata = jest.fn();
    const showDeleteConfirmation = jest.fn();
    const selectedHistories = [];

    render(
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

    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });
});
