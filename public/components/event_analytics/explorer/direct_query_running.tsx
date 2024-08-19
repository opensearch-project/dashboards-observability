/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiSmallButton,
  EuiEmptyPrompt,
  EuiProgress,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';
import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { DirectQueryLoadingStatus } from '../../../../common/types/explorer';
import { coreRefs } from '../../../framework/core_refs';
import { SQLService } from '../../../services/requests/sql';
import {
  selectSearchMetaData,
  update as updateSearchMetaData,
} from '../redux/slices/search_meta_data_slice';
import { AccelerateCallout } from './accelerate_callout';

interface DirectQueryRunningProps {
  tabId: string;
  isS3Connection: boolean;
  onCreateAcceleration: () => void;
}

export const DirectQueryRunning = ({
  tabId,
  isS3Connection,
  onCreateAcceleration,
}: DirectQueryRunningProps) => {
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
    <>
      {isS3Connection && <AccelerateCallout onCreateAcceleration={onCreateAcceleration} />}
      <EuiEmptyPrompt
        icon={<EuiProgress size="xs" color="accent" />}
        title={<h2>Query Processing</h2>}
        body={
          <>
            <EuiText>
              Status: {explorerSearchMeta.status ?? DirectQueryLoadingStatus.SCHEDULED}
            </EuiText>
            <EuiSpacer size="s" />
            <EuiFlexGroup>
              <EuiFlexItem>
                <EuiSmallButton color="success" onClick={cancelQuery}>
                  Cancel
                </EuiSmallButton>
              </EuiFlexItem>
              {isS3Connection && (
                <EuiFlexItem>
                  <EuiSmallButton fill onClick={onCreateAcceleration}>
                    Create acceleration
                  </EuiSmallButton>
                </EuiFlexItem>
              )}
            </EuiFlexGroup>
          </>
        }
      />
    </>
  );
};
