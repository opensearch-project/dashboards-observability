/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiPage, EuiPageBody, EuiSpacer, EuiText } from '@elastic/eui';
import { ChromeBreadcrumb } from '../../../../../src/core/public';

export interface ApmApplicationMapProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  [key: string]: any;
}

export const ApplicationMap = (props: ApmApplicationMapProps) => {
  const { chrome } = props;

  React.useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Application Map',
        href: '#/application-map',
      },
    ]);
  }, [chrome]);

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiSpacer size="l" />
        <EuiText>
          <p>APM Application Map page. Will show service topology visualization.</p>
        </EuiText>
      </EuiPageBody>
    </EuiPage>
  );
};
