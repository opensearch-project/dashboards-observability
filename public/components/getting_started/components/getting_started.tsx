/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { HomeProps } from 'public/components/getting_started/home';
import { GettingStartedConnectionsHeader } from './getting_started_header';
import { PickYourSource } from './getting_started_sections';
import { DataShipment } from './getting_started_dataShipment';
import { QueryData } from './getting_started_queryData';
import { AnalyzeData } from './getting_started_analyzeData';

export const NewGettingStarted = (props: HomeProps) => {
  const { chrome } = props;
  const [selectedSource, setSelectedSource] = useState('');
  const [isPickYourSourceOpen, setIsPickYourSourceOpen] = useState(true);
  const [isDataShipmentOpen, setIsDataShipmentOpen] = useState(false);
  const [isQueryDataOpen, setIsQueryDataOpen] = useState(false);
  const [isAnalyzeDataOpen, setIsAnalyzeDataOpen] = useState(false);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Getting Started',
        href: '#/',
      },
    ]);
  }, []);

  const handleSelectSource = (source: string) => {
    setSelectedSource(source);
    setIsPickYourSourceOpen(false);
    setIsDataShipmentOpen(true);
  };

  const togglePickYourSource = (isOpen: boolean) => {
    setIsPickYourSourceOpen(isOpen);
    if (isOpen) {
      setIsDataShipmentOpen(false);
      setIsQueryDataOpen(false);
      setIsAnalyzeDataOpen(false);
    }
  };

  const toggleDataShipment = (isOpen: boolean) => {
    setIsDataShipmentOpen(isOpen);
  };

  const toggleQueryData = (isOpen: boolean) => {
    setIsQueryDataOpen(isOpen);
  };

  const toggleAnalyzeData = (isOpen: boolean) => {
    setIsAnalyzeDataOpen(isOpen);
  };

  const setQueryDataOpen = () => {
    setIsDataShipmentOpen(false);
    setIsQueryDataOpen(true);
  };

  const setAnalyzeDataOpen = () => {
    setIsQueryDataOpen(false);
    setIsAnalyzeDataOpen(true);
  };

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <GettingStartedConnectionsHeader />
        <EuiSpacer size="l" />
        <PickYourSource
          onSelectSource={handleSelectSource}
          selectedSource={selectedSource}
          isOpen={isPickYourSourceOpen}
          onToggle={togglePickYourSource}
        />
        <EuiSpacer size="l" />
        <DataShipment
          isOpen={isDataShipmentOpen}
          onToggle={toggleDataShipment}
          selectedTechnology={selectedSource}
          onMoveToQueryData={setQueryDataOpen}
        />
        <EuiSpacer size="l" />
        <QueryData
          isOpen={isQueryDataOpen}
          onToggle={toggleQueryData}
          selectedTechnology={selectedSource}
          onMoveToAnalyzeData={setAnalyzeDataOpen}
        />
        <EuiSpacer size="l" />
        <AnalyzeData
          isOpen={isAnalyzeDataOpen}
          onToggle={toggleAnalyzeData}
          selectedTechnology={selectedSource}
        />
      </EuiPageBody>
    </EuiPage>
  );
};
