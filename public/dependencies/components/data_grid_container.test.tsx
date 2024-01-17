/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { DataGridContainer } from './data_grid_container';
import { RenderProps } from '../../types';
import { store } from '../../framework/redux/store';
import { DataGridProps } from '../../components/event_analytics/explorer/events_views/data_grid';
import {
  DEFAULT_SOURCE_COLUMN as mock_DEFAULT_SOURCE_COLUMN,
  DEFAULT_TIMESTAMP_COLUMN as mock_DEFAULT_TIMESTAMP_COLUMN,
} from '../../../common/constants/explorer';

jest.mock('../../components/event_analytics/utils/utils', () => ({
  redoQuery: (...args: any[]) => {
    args[7]([
      {
        timestamp: 'now',
        count: 1,
      },
    ]);
  },
}));

jest.mock('../../../common/utils', () => ({
  getPPLService: () => ({}),
  getOSDHttp: () => ({}),
}));

jest.mock('../../components/event_analytics/explorer/events_views/data_grid', () => ({
  DataGrid: (props: DataGridProps) => {
    const columnsResult = props.formatGridColumn?.([
      mock_DEFAULT_TIMESTAMP_COLUMN,
      mock_DEFAULT_SOURCE_COLUMN,
    ]);
    return (
      <div data-test-subj="test">
        {JSON.stringify({ ...props, columns: columnsResult }, null, 2)}
      </div>
    );
  },
}));

describe('<DataGridContainer />', () => {
  it('should render when all props are provided', async () => {
    const { container, findByTestId } = render(
      <Provider store={store}>
        <DataGridContainer
          rawQuery="source=foo"
          renderProps={{
            props: {
              message: {
                type: 'output',
                contentType: 'ppl_data_grid',
                content: 'source=foo',
              },
            },
            chatContext: {
              flyoutFullScreen: false,
            } as RenderProps['chatContext'],
          }}
        />
      </Provider>
    );
    await findByTestId('test');
    expect(container).toMatchSnapshot();
  });

  it('should render empty when rawQuery is not provided', async () => {
    const { container, queryByTestId } = render(
      <Provider store={store}>
        <DataGridContainer
          rawQuery=""
          renderProps={{
            props: {
              message: {
                type: 'output',
                contentType: 'ppl_data_grid',
                content: 'source=foo',
              },
            },
            chatContext: {
              flyoutFullScreen: false,
            } as RenderProps['chatContext'],
          }}
        />
      </Provider>
    );
    await waitFor(() => {
      expect(queryByTestId('test')).toBeNull();
    });
    expect(container).toMatchSnapshot();
  });

  it('should switch props when in full screen mode', async () => {
    const { container, findByTestId } = render(
      <Provider store={store}>
        <DataGridContainer
          rawQuery="source=foo"
          renderProps={{
            props: {
              message: {
                type: 'output',
                contentType: 'ppl_data_grid',
                content: 'source=foo',
              },
            },
            chatContext: {
              flyoutFullScreen: true,
            } as RenderProps['chatContext'],
          }}
        />
      </Provider>
    );
    await findByTestId('test');
    expect(container).toMatchSnapshot();
  });
});
