/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { EuiProgress, EuiEmptyPrompt, EuiButton, EuiText, EuiSpacer } from '@elastic/eui';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../redux/slices/search_meta_data_slice';
import { DirectQueryLoadingStatus } from '../../../../common/types/explorer';

export const DirectQueryRunning = ({ tabId }: { tabId: string }) => {
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId] || {};
  const dispatch = useDispatch();
  return (
    <EuiEmptyPrompt
      icon={<EuiProgress size="xs" color="accent" />}
      title={<h2>Query Processing</h2>}
      body={
        <>
          <EuiText>
            Status: {explorerSearchMeta.status ?? DirectQueryLoadingStatus.SCHEDULED}
          </EuiText>
          <EuiSpacer size="s" />
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
        </>
      }
    />
  );
};
