/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiAccordion, EuiPanel, EuiText, EuiFlexGroup, EuiFlexItem, EuiCard } from '@elastic/eui';

export const PickYourSource = ({ onSelectSource, selectedSource, isOpen, onToggle }) => (
  <EuiAccordion
    id="pickYourSource"
    buttonContent={selectedSource ? `Pick Your Source: ${selectedSource}` : 'Pick Your Source'}
    paddingSize="m"
    forceState={isOpen ? 'open' : 'closed'}
    onToggle={onToggle}
  >
    <EuiPanel>
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="Catalog"
            description="Choose from a catalog of data sources"
            onClick={() => onSelectSource('Catalog')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="Custom"
            description="Create a custom data source"
            onClick={() => onSelectSource('Custom')}
          />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiCard
            layout="vertical"
            title="Sample Data"
            description="Use sample data for exploration"
            onClick={() => onSelectSource('Sample Data')}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  </EuiAccordion>
);

export const DataShipment = () => (
  <EuiAccordion
    id="dataShipment"
    buttonContent="Data Shipment"
    paddingSize="m"
    initialIsOpen={false}
  >
    <EuiPanel>
      <EuiText>
        <p>Content for Data Shipment goes here.</p>
      </EuiText>
    </EuiPanel>
  </EuiAccordion>
);

export const QueryData = () => (
  <EuiAccordion id="queryData" buttonContent="Query Data" paddingSize="m" initialIsOpen={false}>
    <EuiPanel>
      <EuiText>
        <p>Content for Query Data goes here.</p>
      </EuiText>
    </EuiPanel>
  </EuiAccordion>
);

export const AnalyzeData = () => (
  <EuiAccordion id="analyzeData" buttonContent="Analyze Data" paddingSize="m" initialIsOpen={false}>
    <EuiPanel>
      <EuiText>
        <p>Content for Analyze Data goes here.</p>
      </EuiText>
    </EuiPanel>
  </EuiAccordion>
);
