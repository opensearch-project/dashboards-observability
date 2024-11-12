/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiIcon,
  EuiTitle,
  EuiText,
  EuiButton,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { coreRefs } from '../../../framework/core_refs';
import { dataSourceManagementPluginId } from '../../../../common/constants/shared';

export function AddDataSourceCallout() {
  return (
    <EuiPanel paddingSize="m" hasShadow={true}>
      <EuiFlexGroup justifyContent="center" alignItems="center" direction="column" gutterSize="m">
        <EuiFlexItem grow={false}>
          <EuiIcon size="xxl" type="database" />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiTitle size="m">
            <h3>No connected data sources</h3>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ maxWidth: '40%' }}>
          <EuiText textAlign="center">
            <p style={{ margin: 0 }}>
              {i18n.translate('traceAnalytics.noDataSourcesMessage', {
                defaultMessage:
                  'There are no data sources associated to the workspace. Associate data sources or request your administrator to associate data sources for you to get started.',
              })}
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton
            fill
            color="primary"
            onClick={() =>
              coreRefs.application?.navigateToApp(dataSourceManagementPluginId, { path: '#/' })
            }
          >
            Manage data sources
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
}
