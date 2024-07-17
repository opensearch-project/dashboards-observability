/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  EuiAccordion,
  EuiPanel,
  EuiText,
  EuiSpacer,
  EuiButton,
  EuiFieldSearch,
} from '@elastic/eui';
import otelJson from './OTEL.json';

interface QueryDataProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
  onMoveToAnalyzeData: () => void;
}

export const QueryData: React.FC<QueryDataProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
  onMoveToAnalyzeData,
}) => {
  const [usePreCanned, setUsePreCanned] = useState<string | null>(null);
  const [indexPatterns, setIndexPatterns] = useState<string[]>([]);
  const [searchValue, setSearchValue] = useState<string>('');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTechnology === 'OTEL') {
      const patterns = otelJson['getting-started']['index-patterns']['index-patterns'];
      setIndexPatterns(patterns);
    } else {
      setIndexPatterns([]);
    }
    setUsePreCanned(null);
    setSearchValue('');
    setSaveMessage(null);
  }, [selectedTechnology]);

  const onPatternClick = (pattern: string) => {
    setSearchValue(pattern);
  };

  const handleSave = () => {
    setSaveMessage('Saved successfully');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const selectableOptions = [
    {
      label: 'Yes',
      id: 'yes',
      checked: usePreCanned === 'yes' ? 'on' : undefined,
    },
    {
      label: 'No',
      id: 'no',
      checked: usePreCanned === 'no' ? 'on' : undefined,
    },
  ];

  return (
    <EuiAccordion
      id="query-data"
      buttonContent={`Query Data: ${selectedTechnology}`}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>
        {!selectedTechnology ? (
          <EuiText color="danger">
            <p>Please select a collection method first to query data.</p>
          </EuiText>
        ) : (
          <>
            <EuiText>
              <h3>Prepare to Query</h3>
              <p>Use out-of-the-box (pre-canned) dashboards, visualizations for this data?</p>
            </EuiText>
            <div style={{ display: 'flex', gap: '10px' }}>
              {selectableOptions.map((option) => (
                <EuiButton
                  key={option.id}
                  fill={option.checked === 'on'}
                  onClick={() => setUsePreCanned(option.id)}
                  style={{ width: '100px', textAlign: 'center' }}
                >
                  {option.label}
                </EuiButton>
              ))}
            </div>
            <EuiSpacer size="m" />
            {usePreCanned === 'yes' && (
              <div>
                <EuiPanel>
                  <EuiText>
                    <h4>IMAGE HERE</h4>
                  </EuiText>
                </EuiPanel>
                <EuiSpacer size="m" />
                <EuiButton>Install Integration</EuiButton>
                <EuiSpacer size="m" />
                <EuiButton onClick={onMoveToAnalyzeData}>Move to Analyze Data</EuiButton>
              </div>
            )}
            {usePreCanned === 'no' && (
              <div>
                <EuiText>
                  <p>Select an index pattern to query data:</p>
                </EuiText>
                <EuiSpacer size="s" />
                {indexPatterns.map((pattern, idx) => (
                  <EuiButton key={idx} onClick={() => onPatternClick(pattern)}>
                    {pattern}
                  </EuiButton>
                ))}
                <EuiSpacer size="m" />
                <EuiFieldSearch
                  placeholder="Search index patterns"
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  isClearable
                />
                <EuiSpacer size="m" />
                <EuiButton onClick={handleSave}>Save</EuiButton>
                {saveMessage && (
                  <EuiText color="secondary">
                    <p>{saveMessage}</p>
                  </EuiText>
                )}
                <EuiSpacer size="m" />
                <EuiButton onClick={onMoveToAnalyzeData}>Move to Analyze Data</EuiButton>
              </div>
            )}
            <EuiSpacer size="m" />
          </>
        )}
      </EuiPanel>
    </EuiAccordion>
  );
};
