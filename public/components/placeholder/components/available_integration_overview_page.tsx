/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import { EuiFlexItem, EuiPage, EuiPageBody, EuiSpacer, EuiSwitch } from '@elastic/eui';
import _ from 'lodash';
import React, { ReactElement, useEffect, useState } from 'react';
import { AppAnalyticsComponentDeps } from '../home';
import { ApplicationType } from '../../../../common/types/application_analytics';
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AddedIntegrationsTable } from './added_integration_table';
import { AvailableIntegrationsCardView } from './available_integration_card_view';

interface AppTableProps extends AppAnalyticsComponentDeps {
  loading: boolean;
  applications: ApplicationType[];
  fetchApplications: () => void;
  renameApplication: (newAppName: string, appId: string) => void;
  deleteApplication: (appList: string[], panelIdList: string[], toastMessage?: string) => void;
  clearStorage: () => void;
  moveToApp: (id: string, type: string) => void;
}

export function AvailableIntegrationOverviewPage(props: AppTableProps) {
  const { chrome, parentBreadcrumbs } = props;

  const [isCardView, setCardView] = useState(true);

  useEffect(() => {
    chrome.setBreadcrumbs([
      ...parentBreadcrumbs,
      {
        text: 'Placeholder',
        href: '#/placeholder',
      },
    ]);
  }, []);

  return (
    <EuiPage>
      <EuiPageBody component="div">
        {IntegrationHeader()}
        <EuiFlexItem grow={false} style={{ marginBottom: 20 }}>
          <EuiSwitch
            label="Card View"
            checked={isCardView}
            onChange={() => {
              setCardView(!isCardView);
            }}
            // label="Dark mode"
            // checked={isDarkMode}
            // onChange={() => {
            //   uiSettingsService.set('theme:darkMode', !isDarkMode).then((resp) => {
            //     setIsDarkMode(!isDarkMode);
            //     uiSettingsService.addToast({
            //       title: 'Theme setting changes require you to reload the page to take effect.',
            //       text: toMountPoint(
            //         <>
            //           <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
            //             <EuiFlexItem grow={false}>
            //               <EuiButton size="s" onClick={() => window.location.reload()}>
            //                 Reload page
            //               </EuiButton>
            //             </EuiFlexItem>
            //           </EuiFlexGroup>
            //         </>
            //       ),
            //       color: 'success',
            //     });
            //   });
            // }}
          />
        </EuiFlexItem>
        {isCardView
          ? AvailableIntegrationsCardView()
          : AvailableIntegrationsTable({ loading: false })}
      </EuiPageBody>
    </EuiPage>
  );
}
