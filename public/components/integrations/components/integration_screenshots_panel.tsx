/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiFlexGroup, EuiPanel, EuiFlexItem, EuiImage, EuiTitle, EuiSpacer } from '@elastic/eui';
import React from 'react';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';

export function IntegrationScreenshots(props: any) {
  const config = props.integration;
  const http = props.http;
  let screenshots;
  if (config.statics.gallery) {
    screenshots = config.statics.gallery;
  }

  return (
    <EuiPanel data-test-subj={`${config.name}-screenshots`}>
      <EuiTitle>
        <h2>Screenshots</h2>
      </EuiTitle>
      <EuiSpacer />
      <EuiFlexGroup gutterSize="l" alignItems="flexStart">
        {screenshots?.map((screenshot: { path: string; annotation?: string }) => {
          return (
            <EuiFlexItem key={screenshot.path} grow={false}>
              <EuiImage
                src={http.basePath.prepend(
                  `${INTEGRATIONS_BASE}/repository/${config.name}/static/${screenshot.path}`
                )}
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
