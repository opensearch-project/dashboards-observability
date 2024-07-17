/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EuiAccordion, EuiPanel, EuiText, EuiSpacer, EuiSelect } from '@elastic/eui';

export const PickYourSource = ({ onSelectSource, selectedSource, isOpen, onToggle }) => {
  const [collectionMethod, setCollectionMethod] = useState('');
  const [specificMethod, setSpecificMethod] = useState('');

  const handleCollectionMethodChange = (e) => {
    setCollectionMethod(e.target.value);
    setSpecificMethod('');
  };

  const handleSpecificMethodChange = (e) => {
    const selectedMethod = e.target.value;
    setSpecificMethod(selectedMethod);
    onSelectSource(selectedMethod); // Pass selected method to parent
    onToggle(false); // Collapse accordion
  };

  const renderSpecificMethodDropdown = () => {
    if (!collectionMethod) return null;

    let options = [];
    if (collectionMethod === 'Structured') {
      options = [
        { value: 'OTEL', text: 'Open Telemetry' },
        { value: 'Nginx', text: 'Nginx' },
        { value: 'vpc-flow', text: 'VPC Flow' },
      ];
    } else if (collectionMethod === 'Unstructured') {
      options = [
        { value: 'golang', text: 'Golang' },
        { value: 'python', text: 'Python' },
        { value: 'java', text: 'Java' },
      ];
    } else if (collectionMethod === 'Upload File') {
      options = [
        { value: 'Data Prepper', text: 'Data Prepper' },
        { value: 'Flint Data', text: 'Flint Data' },
      ];
    }

    return (
      <>
        <EuiText>Select one of the following</EuiText>
        <EuiSpacer size="s" />
        <EuiSelect
          options={[{ value: '', text: 'Select an option' }, ...options]}
          value={specificMethod}
          onChange={handleSpecificMethodChange}
        />
      </>
    );
  };

  return (
    <EuiAccordion
      id="pickYourSource"
      buttonContent={selectedSource ? `Collect your Data: ${selectedSource}` : 'Collect your Data'}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel style={{ maxWidth: '550px' }}>
        <EuiText>
          <h2>Collect Your Data</h2>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiText>Select a collection method</EuiText>
        <EuiSpacer size="s" />
        <EuiSelect
          options={[
            { value: '', text: 'Select an option' },
            { value: 'Structured', text: 'Structured' },
            { value: 'Unstructured', text: 'Unstructured' },
            { value: 'Upload File', text: 'Upload File' },
          ]}
          value={collectionMethod}
          onChange={handleCollectionMethodChange}
        />
        <EuiSpacer size="m" />
        {renderSpecificMethodDropdown()}
      </EuiPanel>
    </EuiAccordion>
  );
};
