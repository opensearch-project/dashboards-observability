/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiPanel, EuiFlexItem } from '@elastic/eui';
import React from 'react';
import { PanelTitle } from '../../trace_analytics/components/common/helper_functions';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export function IntegrationScreenshots(props: any) {
  const config = props.integration;
  let screenshots;
  if (config.statics.gallery) {
    screenshots = config.statics.gallery;
  }

  return (
    <EuiPanel data-test-subj={`${config.name}-screenshots`}>
      <PanelTitle title={'Screenshots'} />
      <EuiFlexGroup gutterSize="l">
        {screenshots?.map((screenshot: { path: string }) => {
          return (
            <EuiFlexItem key={screenshot.path}>
              <img
                style={{ width: 300, height: 300 }}
                alt=""
                className="synopsisIcon"
                src={`${INTEGRATIONS_BASE}/repository/${config.name}/static/${screenshot.path}`}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
}
