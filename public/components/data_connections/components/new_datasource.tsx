/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFilterSelectItem,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiOverlayMask,
  EuiPage,
  EuiPageBody,
  EuiPageContent,
  EuiPopover,
  EuiPopoverTitle,
  EuiTableFieldDataColumnType,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { DataConnectionsHeader } from './data_connections_header';
import { HomeProps } from '../home';
import { DataConnectionsDescription } from './manage_data_connections_description';
import { DATACONNECTIONS_BASE, INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { useToast } from '../../../../public/components/common/toast';
import { DeleteModal } from '../../../../public/components/common/helpers/delete_modal';
import { AvailableIntegrationsList } from '../../../../public/components/integrations/components/available_integration_overview_page';
import { IntegrationHeader } from '../../../../public/components/integrations/components/integration_header';
import { AvailableIntegrationsCardView } from '../../../../public/components/integrations/components/available_integration_card_view';
import { AvailableIntegrationsTable } from '../../../../public/components/integrations/components/available_integration_table';
import { NewDatasourceCardView } from './new_datasource_card_view';

interface DataConnection {
  connectionType: 'OPENSEARCH' | 'SPARK';
  name: string;
}

export const NewDatasource = (props: HomeProps) => {
  const { chrome, http } = props;

  const [query, setQuery] = useState('');
  const [isCardView, setCardView] = useState(true);
  const [data, setData] = useState<AvailableIntegrationsList>({ hits: [] });

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const [items, setItems] = useState([] as Array<{ name: string; checked: boolean }>);

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
