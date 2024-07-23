/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiFieldSearch,
  EuiFilterButton,
  EuiFilterGroup,
  EuiFilterSelectItem,
  EuiPopover,
  EuiPopoverTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiCard,
  EuiText,
  EuiBadge,
  EuiSpacer,
} from '@elastic/eui';
import { coreRefs } from '../../../../public/framework/core_refs';

export const IntegrationCards = () => {
  const [integrationData, setIntegrationData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [items, setItems] = useState([] as Array<{ name: string; checked: boolean }>);

  useEffect(() => {
    async function fetchIntegrationData() {
      try {
        const response = await coreRefs.http!.get(`/api/integrations/repository`);
        const data = response.data.hits;
        setIntegrationData(data);
        const categories = Array.from(new Set(data.flatMap((item: any) => item.labels ?? [])));
        setItems(categories.map((name) => ({ name, checked: false })));
      } catch (error) {
        console.error('Error fetching integration data:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchIntegrationData();
  }, []);

  const updateItem = (index: number) => {
    if (!items[index]) {
      return;
    }
    const newItems = [...items];
    newItems[index].checked = !items[index].checked;
    setItems(newItems);
  };

  const renderFilters = () => {
    const button = (
      <EuiFilterButton
        iconType="arrowDown"
        onClick={() => setIsPopoverOpen(!isPopoverOpen)}
        isSelected={isPopoverOpen}
        numFilters={items.length}
        hasActiveFilters={!!items.find((item) => item.checked)}
        numActiveFilters={items.filter((item) => item.checked).length}
      >
        Categories
      </EuiFilterButton>
    );

    return (
      <EuiFlexGroup>
        <EuiFlexItem>
          <EuiFieldSearch
            fullWidth
            placeholder="Search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFilterGroup>
            <EuiPopover
              id="popoverExampleMultiSelect"
              button={button}
              isOpen={isPopoverOpen}
              closePopover={() => setIsPopoverOpen(false)}
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
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const filteredHits = integrationData.filter(
    (hit) =>
      (!query || hit.name.toLowerCase().includes(query.toLowerCase())) &&
      items.filter((item) => item.checked).every((item) => hit.labels?.includes(item.name))
  );

  const renderIntegrationCards = () => {
    if (loading) {
      return <EuiText>Loading...</EuiText>;
    }

    if (filteredHits.length === 0) {
      return (
        <EuiText>
          <h3>No integrations available</h3>
          <p>There are no integrations available at this time.</p>
        </EuiText>
      );
    }

    return (
      <EuiFlexGroup gutterSize="l" style={{ flexWrap: 'wrap' }}>
        {filteredHits.map((integration, index) => (
          <EuiFlexItem key={index} style={{ minWidth: '14rem', maxWidth: '14rem' }}>
            <EuiCard
              icon={
                integration.statics && integration.statics.logo && integration.statics.logo.path ? (
                  <img
                    style={{ height: 100, width: 100 }}
                    alt=""
                    className="synopsisIcon"
                    src={`/api/integrations/repository/${integration.name}/static/${integration.statics.logo.path}`}
                  />
                ) : (
                  <div style={{ height: 100, width: 100, backgroundColor: '#ccc' }} />
                )
              }
              title={integration.displayName || integration.name}
              description={integration.description}
              data-test-subj={`integration_card_${integration.name.toLowerCase()}`}
              titleElement="span"
              href={`/app/integrations#/available/${integration.name}`}
              footer={
                <div>
                  {integration.labels &&
                    integration.labels.map((label: string, idx: number) => (
                      <EuiBadge key={idx}>{label}</EuiBadge>
                    ))}
                </div>
              }
            />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    );
  };

  return (
    <>
      {renderFilters()}
      <EuiSpacer size="m" />
      {renderIntegrationCards()}
    </>
  );
};
