/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiPanel, EuiFlexItem, EuiImage } from '@elastic/eui';
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
      <EuiFlexGroup gutterSize="l" alignItems="flexStart">
        {screenshots?.map((screenshot: { path: string; annotation?: string }) => {
          return (
            <EuiFlexItem key={screenshot.path} grow={false}>
              <EuiImage
                src={`${INTEGRATIONS_BASE}/repository/${config.name}/static/${screenshot.path}`}
                alt={screenshot.annotation ? screenshot.annotation : ''}
                allowFullScreen={true}
                size={300}
              />
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </EuiPanel>
  );
}
