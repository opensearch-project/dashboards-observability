/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import { EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { HomeProps } from 'public/components/getting_started/home';
import { GettingStartedConnectionsHeader } from './getting_started_header';
import { CollectAndShipData } from './getting_started_collectData';
import { QueryAndAnalyze } from './getting_started_queryAndAnalyze';

interface ExtendedHomeProps extends HomeProps {
  selectedDataSourceId: string;
  selectedDataSourceLabel: string;
}

export const NewGettingStarted = (props: ExtendedHomeProps) => {
  const { chrome, selectedDataSourceId, selectedDataSourceLabel } = props;
  const [selectedSource, setSelectedSource] = useState('');
  const [isPickYourSourceOpen, setIsPickYourSourceOpen] = useState(true);
  const [isQueryDataOpen, setIsQueryDataOpen] = useState(false);
  const [isSampleDataset, setIsSampleDataset] = useState(false);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: 'Getting Started',
        href: '#/',
      },
    ]);
  }, [chrome]);

  const handleSelectSource = (source: string) => {
    setSelectedSource(source);
  };

  const togglePickYourSource = (isOpen: boolean) => {
    setIsPickYourSourceOpen(isOpen);
    if (isOpen) {
      setIsQueryDataOpen(false);
    }
  };

  const toggleQueryData = (isOpen: boolean) => {
    setIsQueryDataOpen(isOpen);
  };

  const setQueryDataOpen = () => {
    setIsPickYourSourceOpen(false);
    setIsQueryDataOpen(true);
  };

  const handleCardSelectionChange = (isSample: boolean) => {
    setIsSampleDataset(isSample);
  };

  return (
    <EuiPage>
      <EuiPageBody component="div">
        <GettingStartedConnectionsHeader />
        <EuiSpacer size="l" />
        <CollectAndShipData
          isOpen={isPickYourSourceOpen}
          onToggle={togglePickYourSource}
          selectedTechnology={selectedSource}
          onMoveToQueryData={setQueryDataOpen}
          onSelectSource={handleSelectSource}
          onCardSelectionChange={handleCardSelectionChange}
          selectedDataSourceId={selectedDataSourceId}
          selectedDataSourceLabel={selectedDataSourceLabel}
        />
        <EuiSpacer size="l" />
        {!isSampleDataset && (
          <QueryAndAnalyze
            isOpen={isQueryDataOpen}
            onToggle={toggleQueryData}
            selectedTechnology={selectedSource}
            selectedDataSourceId={selectedDataSourceId}
            selectedDataSourceLabel={selectedDataSourceLabel}
          />
        )}
      </EuiPageBody>
    </EuiPage>
  );
};
