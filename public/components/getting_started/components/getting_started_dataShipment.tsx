/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { EuiAccordion, EuiPanel, EuiTitle, EuiText, EuiSpacer } from '@elastic/eui';

export const DataShipment: React.FC<DataShipmentProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
}) => {
  const [tutorial, setTutorial] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [_htmlResponse, setHtmlResponse] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTechnology === 'OTEL') {
      const url = './OTEL.json';
      console.log('Attempting to fetch URL:', url);
      fetch(url)
        .then((response) => {
          console.log('Response received');
          // Check if the response is JSON
          if (response.headers.get('Content-Type')?.includes('application/json')) {
            return response.json(); // Parse JSON data
          } else {
            // Handle non-JSON response
            return response.text().then((text) => {
              setHtmlResponse(text);
              throw new Error(`Unexpected response type: ${response.headers.get('Content-Type')}`);
            });
          }
        })
        .then((data) => {
          console.log('Parsed data successfully:', data);
          setTutorial(data.tutorial); // Store the tutorial part of the JSON
        })
        .catch((err) => {
          // Renamed 'error' to 'err'
          console.error('Error during fetch or processing:', err);
          setError('Failed to fetch or process tutorial data');
        });
    }
  }, [selectedTechnology]);

  const renderSteps = (steps: any[]) => {
    return steps.map((step, index) => (
      <div key={index}>
        <EuiTitle size="s">
          <h3>{step.step}</h3>
        </EuiTitle>
        <EuiText>{step.description}</EuiText>
        <EuiText>
          <pre>{step.code}</pre>
        </EuiText>
        <EuiSpacer size="m" />
      </div>
    ));
  };

  const renderContent = () => {
    if (error) {
      return (
        <EuiText color="danger">
          <h3>Error</h3>
          <p>{error}</p>
        </EuiText>
      );
    }

    if (selectedTechnology === 'OTEL' && tutorial) {
      return (
        <div>
          <EuiTitle size="m">
            <h2>{tutorial.title}</h2>
          </EuiTitle>
          {renderSteps(tutorial.steps)}
        </div>
      );
    }

    return (
      <EuiText>
        <h3>Select a Technology</h3>
        <p>Please select a technology to view data shipment information.</p>
      </EuiText>
    );
  };

  return (
    <EuiAccordion
      id="data-shipment"
      buttonContent={selectedTechnology ? `Data Shipment: ${selectedTechnology}` : 'Data Shipment'}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>{renderContent()}</EuiPanel>
    </EuiAccordion>
  );
};
