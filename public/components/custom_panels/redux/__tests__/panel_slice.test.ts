/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyMiddleware, createStore } from '@reduxjs/toolkit';
import thunk from 'redux-thunk';
import { coreRefs } from '../../../../framework/core_refs';
import { rootReducer } from '../../../../framework/redux/reducers';
import { fetchPanels, selectPanelList } from '../panel_slice';

describe('Panel slice', () => {
  const store = createStore(rootReducer, applyMiddleware(thunk));

  it('keeps the saved object id when attributes carry a stale id', async () => {
    coreRefs.savedObjectsClient.find = jest.fn(() =>
      Promise.resolve({
        savedObjects: [
          {
            id: 'real-id',
            type: 'observability-panel',
            attributes: { id: 'stale-source-id', title: 'test (copy)' },
          },
        ],
      })
    );
    coreRefs.http.get = jest.fn(() => Promise.resolve({ panels: [] }));

    await store.dispatch(fetchPanels());

    const [panel] = selectPanelList(store.getState());
    expect(panel.id).toBe('real-id');
    expect(panel.objectId).toBe('observability-panel:real-id');
    expect(panel.title).toBe('test (copy)');
  });
});
