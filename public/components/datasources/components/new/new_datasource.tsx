/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { DataConnectionsHeader } from '../data_connections_header';
import { HomeProps } from '../../home';
import { NewDatasourceCardView } from './new_datasource_card_view';

export const NewDatasource = (props: HomeProps) => {
  const { chrome } = props;

  // TODO: implement searching the card view with this
  const [query, setQuery] = useState('');
  const [isCardView, setCardView] = useState(true);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Data sources',
        href: '#/',
      },
    ]);
  }, []);

  // TODO: implement table view
  const NewDatasourceTableView = () => {
    return null;
  };

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <DataConnectionsHeader />
        {isCardView ? <NewDatasourceCardView /> : <NewDatasourceTableView />}
      </EuiPageBody>
    </EuiPage>
  );
};
