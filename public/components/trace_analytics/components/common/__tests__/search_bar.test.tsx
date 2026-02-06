/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import sinon from 'sinon';
import { renderDatePicker, SearchBar } from '../search_bar';

describe('Search bar components', () => {
  it('renders date picker', async () => {
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    render(renderDatePicker('now-5m', setStartTime, 'now', setEndTime));
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });
  });

  it('renders search bar', async () => {
    const refresh = jest.fn();
    const setQuery = jest.fn();
    const setStartTime = jest.fn();
    const setEndTime = jest.fn();
    const setFilters = jest.fn();
    render(
      <SearchBar
        refresh={refresh}
        page="dashboard"
        query="test"
        setQuery={setQuery}
        startTime="now-5m"
        setStartTime={setStartTime}
        endTime="now"
        setEndTime={setEndTime}
        filters={[]}
        setFilters={setFilters}
        appConfigs={[]}
        mode={'data_prepper'}
        attributesFilterFields={[]}
      />
    );
    await waitFor(() => {
      expect(document.body).toMatchSnapshot();
    });

    // Set up fake timers only for the debounced input test
    const clock = sinon.useFakeTimers();
    const searchInput = screen.getByTestId('search-bar-input-box');
    fireEvent.change(searchInput, { target: { value: 'queryTest' } });

    clock.tick(100);
    expect(setQuery).toBeCalledWith('queryTest');
    clock.restore();
  });
});
