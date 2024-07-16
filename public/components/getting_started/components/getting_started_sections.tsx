/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { EuiAccordion, EuiPanel, EuiFlexGroup, EuiFlexItem, EuiCard } from '@elastic/eui';

export const PickYourSource = ({ onSelectSource, selectedSource, isOpen, onToggle }) => (
  <EuiAccordion
    id="pickYourSource"
    buttonContent={selectedSource ? `Pick Your Source: ${selectedSource}` : 'Pick Your Source'}
    paddingSize="m"
    forceState={isOpen ? 'open' : 'closed'}
    onToggle={onToggle}
  >
    <EuiPanel style={{ maxWidth: '550px' }}>
      <EuiFlexGroup gutterSize="l" style={{ minWidth: '30rem', maxWidth: '30rem' }}>
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
