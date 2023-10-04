/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDispatch } from 'react-redux';
import { EuiProgress, EuiEmptyPrompt, EuiButton } from '@elastic/eui';
import { update as updateSearchMetaData } from '../redux/slices/search_meta_data_slice';

export const DirectQueryRunning = ({ tabId }: { tabId: string }) => {
  const dispatch = useDispatch();
  return (
    <EuiEmptyPrompt
      icon={<EuiProgress size="xs" color="accent" />}
      title={<h2>Query Processing</h2>}
      body={
        <EuiButton
          color="success"
          onClick={() => {
            dispatch(
              updateSearchMetaData({
                tabId,
                data: {
                  isPolling: false,
                },
              })
            );
          }}
        >
          Cancel
        </EuiButton>
      }
    />
  );
};
