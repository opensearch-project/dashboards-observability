/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  EuiAccordion,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiFlexGroup,
  EuiFlexItem,
} from '@elastic/eui';

export const AccordionFilterPage = () => {
  const [selectedItems, setSelectedItems] = useState([]);
  const [expandedAccordion, setExpandedAccordion] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('');

  const toggleSelection = (item) => {
    setSelectedItems((prevSelectedItems) =>
      prevSelectedItems.includes(item)
        ? prevSelectedItems.filter((i) => i !== item)
        : [...prevSelectedItems, item]
    );
    setSelectedFilter(item);
  };

  const isSelected = (item) => selectedItems.includes(item);

  const renderNestedItems = (items, prefix) => {
    return items.map((item) => (
      <EuiFlexItem key={item} style={{ margin: '0.0rem 0' }}>
        <EuiPanel
          onClick={() => toggleSelection(`${prefix}-${item}`)}
          color={isSelected(`${prefix}-${item}`) ? 'primary' : 'subdued'}
          style={{
            cursor: 'pointer',
            backgroundColor: isSelected(`${prefix}-${item}`) ? '#0079a5' : '#f5f7fa',
            color: isSelected(`${prefix}-${item}`) ? '#fff' : '#000',
          }}
        >
          {item}
        </EuiPanel>
      </EuiFlexItem>
    ));
  };

  const renderCollapsibleCategories = (categories, accordionId) => {
    return Object.keys(categories).map((category) => (
      <EuiAccordion
        key={category}
        id={`${accordionId}-${category}`}
        buttonContent={category}
        paddingSize="s"
        initialIsOpen={false}
      >
        <EuiFlexGroup direction="row" wrap>
          {renderNestedItems(categories[category], `${accordionId}-${category}`)}
        </EuiFlexGroup>
      </EuiAccordion>
    ));
  };

  const accordions = [
    {
      id: 'logs',
      title: 'Logs',
      items: {
        Unstructured: ['Java', 'Python', 'Golang'],
        Technology: ['AWS', 'Nginx', 'Apache', 'OpenTelemetry', 'Java', 'Python', 'Golang'],
        Ingestion: [
          'DataPrepper',
          'Fluent Bit',
          'Otel Collector',
          'S3',
          'Java',
          'Python',
          'Golang',
        ],
        Integration: ['Choice 1', 'Choice 2'],
        Dashboards: ['Choice 1', 'Choice 2'],
      },
    },
    {
      id: 'metrics',
      title: 'Metrics',
      items: {
        Technology: ['AWS', 'OpenTelemetry', 'Kubernetes', 'Java', 'Python', 'Golang'],
        Ingestion: [
          'DataPrepper',
          'Fluent Bit',
          'Otel Collector',
          'S3',
          'Java',
          'Python',
          'Golang',
        ],
        Integration: ['Kubernetes', 'OpenTelemetry'],
        Dashboards: ['Choice 1', 'Choice 2'],
      },
    },
    {
      id: 'traces',
      title: 'Traces',
      items: {
        Technology: ['OpenTelemetry', 'Kubernetes', 'Java', 'Python', 'Golang'],
        Ingestion: [
          'DataPrepper',
          'Fluent Bit',
          'Otel Collector',
          'S3',
          'Java',
          'Python',
          'Golang',
        ],
        Integration: ['OpenTelemetry'],
        Dashboards: ['OpenTelemetry'],
      },
    },
  ];

  const renderContent = () => {
    switch (selectedFilter) {
      case 'logs-Technology-Nginx':
        return <p>This is the tutorial for Nginx.</p>;
      case 'logs-Technology-AWS':
        return <p>This is the tutorial for AWS.</p>;
      // Add more cases as needed for other filters
      default:
        return <p>Select a filter to see the tutorial.</p>;
    }
  };

  return (
    <EuiPanel>
      <EuiFlexGroup gutterSize="l">
        {accordions.map((accordion) => (
          <EuiFlexItem key={accordion.id} style={{ maxWidth: '400px' }}>
            <EuiAccordion
              id={accordion.id}
              buttonContent={accordion.title}
              paddingSize="m"
              initialIsOpen={expandedAccordion === accordion.id}
              onToggle={() =>
                setExpandedAccordion(expandedAccordion === accordion.id ? '' : accordion.id)
              }
            >
              <EuiFlexGroup direction="column">
                {renderCollapsibleCategories(accordion.items, accordion.id)}
              </EuiFlexGroup>
            </EuiAccordion>
            <EuiSpacer size="m" />
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
      <EuiSpacer size="l" />
      <EuiPanel style={{ minHeight: '400px' }}>
        {/* Content for the window beneath the accordions goes here */}
        <EuiText>
          <h3>Content Window</h3>
          <p>This is where content related to the selected filters will be displayed.</p>
          {renderContent()}
        </EuiText>
      </EuiPanel>
    </EuiPanel>
  );
};
