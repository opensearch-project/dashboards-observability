/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFilterSelectItem,
  EuiPage,
  EuiPageBody,
  EuiPopover,
  EuiPopoverTitle,
} from '@elastic/eui';
import _ from 'lodash';
import React, { useEffect, useState } from 'react';
import { TabbedPage } from '../../common/tabbed_page/tabbed_page';
import { DatasourcesHeader } from './datasources_header';
import { AvailableIntegrationsCardView } from '../../../../public/components/integrations/components/available_integration_card_view';
import { DatasourcesCardView } from './datasources_card_view';

export interface AvailableIntegrationType {
  name: string;
  description: string;
  assetUrl?: string | undefined;
  version?: string | undefined;
  displayName?: string;
  integrationType: string;
  statics: any;
  components: any[];
  displayAssets: any[];
}

export interface AvailableIntegrationsTableProps {
  loading: boolean;
  data: AvailableIntegrationsList;
  isCardView: boolean;
  setCardView: (input: boolean) => void;
  renderCateogryFilters: () => React.JSX.Element;
}

export interface AvailableIntegrationsList {
  hits: AvailableIntegrationType[];
}

export interface AvailableIntegrationsCardViewProps {
  data: AvailableIntegrationsList;
  isCardView: boolean;
  setCardView: (input: boolean) => void;
  query: string;
  setQuery: (input: string) => void;
  renderCateogryFilters: () => React.JSX.Element;
}

export function Datasources() {
  return (
    <EuiPage>
      <EuiPageBody>
        {TabbedPage({
          tabNames: [
            ['manage', 'Manage connections'],
            ['new', 'New connection'],
          ],
          header: DatasourcesHeader(),
        })}
        {DatasourcesCardView({
          data: {
            hits: [
              {
                name: 'AWS S3',
                version: '1.0.1',
                displayName: 'AWS S3',
                integrationType: 'logs',
                description: 'Connect to AWS S3',
                statics: {
                  logo: { annotation: 'NginX Logo', path: 'logo.svg' },
                  gallery: [
                    { annotation: 'NginX Dashboard', path: 'dashboard1.png' },
                    { annotation: 'NginX Logo', path: 'logo.svg' },
                  ],
                },
                displayAssets: [],
                components: [],
              },
            ],
          },
          isCardView: true,
          setCardView: () => {},
          query: '',
          setQuery: () => {},
          renderCateogryFilters: () => <></>,
        })}
      </EuiPageBody>
    </EuiPage>
  );
}
