/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody } from '@elastic/eui';
import React, { useEffect } from 'react';
import { DataConnectionsHeader } from '../data_connections_header';
import { HomeProps } from '../../home';
import { NewDatasourceCardView } from './new_datasource_card_view';

export const NewDatasource = (props: HomeProps) => {
  const { chrome } = props;

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Data sources',
        href: '#/',
      },
    ]);
  }, []);

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <DataConnectionsHeader />
        <NewDatasourceCardView />
      </EuiPageBody>
    </EuiPage>
  );
};
