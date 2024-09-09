/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiSmallButton, EuiEmptyPrompt, EuiProgress, EuiSpacer, EuiText } from '@elastic/eui';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DirectQueryLoadingStatus } from '../../../../common/types/explorer';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../redux/slices/search_meta_data_slice';

export const DirectQueryRunning = ({ tabId }: { tabId: string }) => {
  const explorerSearchMeta = useSelector(selectSearchMetaData)[tabId] || {};
  const dispatch = useDispatch();
  const sqlService = new SQLService(coreRefs.http);

  const cancelQuery = () => {
    if (explorerSearchMeta.queryId) {
      sqlService.deleteWithJobId({ queryId: explorerSearchMeta.queryId }).catch((e) => {
        console.error(e);
      });
    }

    // reset isPolling flag to remove loading page and queryId to empty
    dispatch(
      updateSearchMetaData({
        tabId,
        data: {
          isPolling: false,
          queryId: '',
        },
      })
    );
  };

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
          <EuiSmallButton color="success" onClick={cancelQuery}>
            Cancel
          </EuiSmallButton>
        </>
      }
    />
  );
};
