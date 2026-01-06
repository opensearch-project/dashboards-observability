/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiPage, EuiPageBody, EuiSpacer, EuiText } from '@elastic/eui';
import { ChromeBreadcrumb } from '../../../../../src/core/public';

export interface ApmServicesProps {
  chrome: any;
  parentBreadcrumb: ChromeBreadcrumb;
  [key: string]: any;
}

export const Services = (props: ApmServicesProps) => {
  const { chrome } = props;

  React.useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Services',
        href: '#/services',
      },
    ]);
  }, [chrome]);

  return (
    <EuiPage>
      <EuiPageBody>
        <EuiSpacer size="l" />
        <EuiText>
          <p>APM Services page.</p>
        </EuiText>
      </EuiPageBody>
    </EuiPage>
  );
};
