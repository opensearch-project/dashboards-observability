/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import ReactDOM from 'react-dom';
import { EuiPage, EuiPageBody, EuiPageContent, EuiText, EuiSpacer, EuiTitle } from '@elastic/eui';
import { AppMountParameters } from '../../../../../src/core/public';
import { ApmToggle } from '../common/apm_toggle';

export const ApmServicesPage = (params: AppMountParameters) => {
  const ApmServicesComponent = () => (
    <EuiPage>
      <EuiPageBody>
        <ApmToggle />
        <EuiPageContent>
          <EuiTitle size="l">
            <h1>Application Monitoring - Services</h1>
          </EuiTitle>
          <EuiSpacer size="m" />
          <EuiText>
            <p>New Application Monitoring Services Page</p>
            <EuiSpacer size="s" />
            <p>
              <strong>Features coming soon:</strong>
            </p>
            <ul>
              <li>Service list</li>
              <li>Service detail</li>
              <li>Service map</li>
            </ul>
          </EuiText>
        </EuiPageContent>
      </EuiPageBody>
    </EuiPage>
  );

  ReactDOM.render(<ApmServicesComponent />, params.element);

  return () => ReactDOM.unmountComponentAtNode(params.element);
};
