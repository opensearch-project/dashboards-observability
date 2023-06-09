/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiPanel, EuiFlexItem } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export function IntegrationScreenshots(props: any) {
  let screenshots;
  if (props.data.data.statics.gallery) {
    screenshots = props.data.data.statics.gallery;
  }

  return (
    <EuiPanel data-test-subj={`${props.data.data.name}-screenshots`}>
      <PanelTitle title={'Screenshots'} />
      <EuiFlexGroup gutterSize="l">
        {screenshots?.map((screenshot: { path: string }) => {
          return (
            <EuiFlexItem key={screenshot.path}>
              <img
                style={{ width: 300, height: 300 }}
                alt=""
                className="synopsisIcon"
                src={`${INTEGRATIONS_BASE}/repository/${props.data.data.name}/static/${screenshot.path}`}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
}
