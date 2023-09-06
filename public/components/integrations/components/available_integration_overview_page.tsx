/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

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
import { IntegrationHeader } from './integration_header';
import { AvailableIntegrationsTable } from './available_integration_table';
import { AvailableIntegrationsCardView } from './available_integration_card_view';
import { INTEGRATIONS_BASE } from '../../../../common/constants/shared';
import { AvailableIntegrationOverviewPageProps } from './integration_types';
import { useToast } from '../../../../public/components/common/toast';
import { HttpStart } from '../../../../../../src/core/public';

export interface AvailableIntegrationType {
  labels?: string[];
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
  http: HttpStart;
}

export function AvailableIntegrationOverviewPage(props: AvailableIntegrationOverviewPageProps) {
  const { chrome, http } = props;

  const [query, setQuery] = useState('');
  const [isCardView, setCardView] = useState(true);
  const { setToast } = useToast();
  const [data, setData] = useState<AvailableIntegrationsList>({ hits: [] });

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const [items, setItems] = useState([] as Array<{ name: string; checked: boolean }>);

  function updateItem(index: number) {
    if (!items[index]) {
      return;
    }
    const newItems = [...items];
    newItems[index].checked = !items[index].checked;
    setItems(newItems);
  }

  const helper = items.filter((item) => item.checked).map((x) => x.name);

  const button = (
    <EuiFilterButton
      iconType="arrowDown"
      onClick={onButtonClick}
      isSelected={isPopoverOpen}
      numFilters={items.length}
      hasActiveFilters={!!items.find((item) => item.checked)}
      numActiveFilters={items.filter((item) => item.checked).length}
    >
      Categories
    </EuiFilterButton>
  );

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Integrations',
        href: '#/',
      },
    ]);
    handleDataRequest();
  }, []);

  async function handleDataRequest() {
    http.get(`${INTEGRATIONS_BASE}/repository`).then((exists) => {
      setData(exists.data);

      let newItems = exists.data.hits
        .flatMap((hit: { labels?: string[] }) => hit.labels ?? []);
      newItems = [...new Set(newItems)].sort().map((newItem) => {
        return {
          name: newItem,
          checked: false,
        };
      });
      setItems(newItems);
    });
  }

  async function addIntegrationRequest(name: string) {
    http
      .post(`${INTEGRATIONS_BASE}/store`)
      .then((res) => {
        setToast(
          `${name} integration successfully added!`,
          'success',
          `View the added assets from ${name} in the Added Integrations list`
        );
      })
      .catch((err) =>
        setToast(
          'Failed to load integration. Check Added Integrations table for more details',
          'danger'
        )
      );
  }

  const renderCateogryFilters = () => {
    return (
      <EuiFilterGroup>
        <EuiPopover
          id="popoverExampleMultiSelect"
          button={button}
          isOpen={isPopoverOpen}
          closePopover={closePopover}
          panelPaddingSize="none"
        >
          <EuiPopoverTitle paddingSize="s">
            <EuiFieldSearch compressed />
          </EuiPopoverTitle>
          <div className="ouiFilterSelect__items">
            {items.map((item, index) => (
              <EuiFilterSelectItem
                checked={item.checked ? 'on' : undefined}
                key={index}
                onClick={() => updateItem(index)}
              >
                {item.name}
              </EuiFilterSelectItem>
            ))}
          </div>
        </EuiPopover>
      </EuiFilterGroup>
    );
  };

  return (
    <EuiPage>
      <EuiPageBody>
        {IntegrationHeader()}
        {isCardView
          ? AvailableIntegrationsCardView({
              data: {
                hits: data.hits.filter((hit) =>
                  helper.every((compon) => hit.components.map((x) => x.name).includes(compon))
                ),
              },
              isCardView,
              setCardView,
              query,
              setQuery,
              renderCateogryFilters,
              http,
            })
          : AvailableIntegrationsTable({
              loading: false,
              data: {
                hits: data.hits.filter((hit) =>
                  helper.every((compon) => hit.components.map((x) => x.name).includes(compon))
                ),
              },
              isCardView,
              setCardView,
              renderCateogryFilters,
            })}
      </EuiPageBody>
    </EuiPage>
  );
}
