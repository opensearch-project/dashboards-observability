/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */
/* eslint-disable react-hooks/exhaustive-deps */

import {
  EuiFieldSearch,
  EuiSmallFilterButton,
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

type CategoryItems = Array<{ name: string; checked: boolean }>;

export interface AvailableIntegrationsTableProps {
  loading: boolean;
  data: AvailableIntegrationsList;
  isCardView: boolean;
  setCardView?: (input: boolean) => void;
  filters?: React.JSX.Element;
  setInstallingIntegration?: (integration: string) => void;
}

export interface AvailableIntegrationsList {
  hits: IntegrationConfig[];
}

export interface AvailableIntegrationsCardViewProps {
  data: AvailableIntegrationsList;
  isCardView: boolean;
  setCardView: (input: boolean) => void;
  query: string;
  setQuery: (input: string) => void;
  filters?: React.JSX.Element;
}

export interface CategoryFiltersProps {
  items: CategoryItems;
  setItems: React.Dispatch<CategoryItems>;
}

export const CategoryFilters = ({ items, setItems }: CategoryFiltersProps) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const onButtonClick = () => {
    setIsPopoverOpen(!isPopoverOpen);
  };

  const closePopover = () => {
    setIsPopoverOpen(false);
  };

  const updateItem = (index: number) => {
    if (!items[index]) {
      return;
    }
    const newItems = [...items];
    newItems[index].checked = !items[index].checked;
    setItems(newItems);
  };

  const button = (
    <EuiSmallFilterButton
      iconType="arrowDown"
      onClick={onButtonClick}
      isSelected={isPopoverOpen}
      numFilters={items.length}
      hasActiveFilters={!!items.find((item) => item.checked)}
      numActiveFilters={items.filter((item) => item.checked).length}
    >
      Categories
    </EuiSmallFilterButton>
  );

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

export function AvailableIntegrationOverviewPage(props: AvailableIntegrationOverviewPageProps) {
  const { chrome, http } = props;

  const [query, setQuery] = useState('');
  const [isCardView, setCardView] = useState(true);
  const [data, setData] = useState<AvailableIntegrationsList>({ hits: [] });

  const [items, setItems] = useState([] as Array<{ name: string; checked: boolean }>);

  const helper = items.filter((item) => item.checked).map((x) => x.name);

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

      let newItems = exists.data.hits.flatMap(
        (hit: { labels?: string[] }) => hit.labels?.sort() ?? []
      );
      newItems = [...new Set(newItems)].sort().map((newItem) => {
        return {
          name: newItem,
          checked: false,
        };
      });
      setItems(newItems);
    });
  }

  const filteredHits = data.hits.filter((hit) => helper.every((tag) => hit.labels?.includes(tag)));
  const filters = <CategoryFilters items={items} setItems={setItems} />;

  return (
    <EuiPage>
      <EuiPageBody>
        <IntegrationHeader />
        {isCardView ? (
          <AvailableIntegrationsCardView
            data={{
              hits: filteredHits,
            }}
            isCardView={isCardView}
            setCardView={setCardView}
            query={query}
            setQuery={setQuery}
            http={http}
            filters={filters}
          />
        ) : (
          <AvailableIntegrationsTable
            loading={false}
            data={{
              hits: filteredHits,
            }}
            isCardView={isCardView}
            setCardView={setCardView}
            filters={filters}
          />
        )}
      </EuiPageBody>
    </EuiPage>
  );
}
