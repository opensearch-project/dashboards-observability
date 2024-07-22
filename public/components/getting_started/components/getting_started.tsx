import { EuiPage, EuiPageBody, EuiSpacer } from '@elastic/eui';
import React, { useEffect, useState } from 'react';
import { HomeProps } from 'public/components/getting_started/home';
import { GettingStartedConnectionsHeader } from './getting_started_header';
import { CollectAndShipData } from './getting_started_collectData';
import { QueryAndAnalyze } from './getting_started_queryAndAnalyze';

export const NewGettingStarted = (props: HomeProps) => {
  const { chrome } = props;
  const [selectedSource, setSelectedSource] = useState('');
  const [isPickYourSourceOpen, setIsPickYourSourceOpen] = useState(true);
  const [isQueryDataOpen, setIsQueryDataOpen] = useState(false);
  const [indexPatterns, setIndexPatterns] = useState<string[]>([]);

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

  const setQueryDataOpen = (patterns: string[]) => {
    setIsPickYourSourceOpen(false);
    setIsQueryDataOpen(true);
    setIndexPatterns(patterns);
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
        />
        <EuiSpacer size="l" />
        <QueryAndAnalyze
          isOpen={isQueryDataOpen}
          onToggle={toggleQueryData}
          selectedTechnology={selectedSource}
          indexPatterns={indexPatterns}
        />
      </EuiPageBody>
    </EuiPage>
  );
};
