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
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiSelect,
  EuiTabbedContent,
  EuiComboBox,
  EuiButton,
  EuiCodeBlock,
  EuiLink,
  EuiListGroup,
  EuiListGroupItem,
  EuiTitle,
} from '@elastic/eui';
import otelJson from './OTEL.json';

interface CollectAndShipDataProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
  onMoveToQueryData: () => void;
  onSelectSource: (source: string) => void;
}

export const CollectAndShipData: React.FC<CollectAndShipDataProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
  onMoveToQueryData,
  onSelectSource,
}) => {
  const [collectionMethod, setCollectionMethod] = useState('');
  const [specificMethod, setSpecificMethod] = useState('');
  const [gettingStarted, setGettingStarted] = useState<any>(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [labelsOptions, setLabelsOptions] = useState([]);
  const [selectedTabId, setSelectedTabId] = useState('workflow_tab');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTechnology === 'OTEL' && otelJson && otelJson['getting-started']) {
      setGettingStarted(otelJson['getting-started']);
      const labels =
        otelJson['getting-started']?.workflows?.[0]?.steps?.map((step: any) => ({
          label: step.label || step.name,
          value: step.name.replace(/\s/g, '-'),
        })) || [];
      setLabelsOptions(labels);
    } else {
      setGettingStarted(null);
    }
  }, [selectedTechnology]);

  const handleCollectionMethodChange = (value) => {
    setCollectionMethod(value);
    setSpecificMethod('');
    setGettingStarted(null);
  };

  const handleSpecificMethodChange = (e) => {
    const selectedMethod = e.target.value;
    setSpecificMethod(selectedMethod);
    onSelectSource(selectedMethod);
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

  const onLabelChange = (selectedOptions: any[]) => {
    if (selectedOptions.length === 0) {
      setSelectedLabel('');
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      });
    } else {
      const selectedValue = selectedOptions[0].value;
      setSelectedLabel(selectedValue);
      const element = document.getElementById(selectedValue);
      if (element) {
        const headerOffset = 100;
        const elementPosition = element.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;
        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth',
        });
      }
    }
  };

  const renderSteps = (steps: any[]) =>
    steps.map((step, index) => (
      <div key={index} id={step.name.replace(/\s/g, '-')}>
        <EuiTitle size="s">
          <h3>{step.name}</h3>
        </EuiTitle>
        {step.label && (
          <EuiText color="secondary">
            <p>{step.label}</p>
          </EuiText>
        )}
        <EuiText>{step.description}</EuiText>
        {step['input-params'] && step['input-params'].length > 0 && (
          <div>
            <EuiTitle size="xs">
              <h4>Input Parameters:</h4>
            </EuiTitle>
            {step['input-params'].map((param, idx) => (
              <EuiText key={idx}>
                <strong>{param.name}:</strong> {param.description} ({param.type})
              </EuiText>
            ))}
          </div>
        )}
        {step.info &&
          step.info.map((link, linkIndex) => (
            <EuiLink key={linkIndex} href={link} target="_blank">
              More Info
            </EuiLink>
          ))}
        {step.content && (
          <EuiCodeBlock language="bash" fontSize="m" paddingSize="s" isCopyable>
            {step.content}
          </EuiCodeBlock>
        )}
        <EuiSpacer size="m" />
      </div>
    ));

  const renderSchema = (schemas: any[]) =>
    schemas.map((schema, idx) => (
      <div key={idx}>
        <EuiTitle size="s">
          <h3>{schema.type} Schema</h3>
        </EuiTitle>
        <EuiText>
          {schema.description}
          <br />
          <strong>Alias:</strong> {schema.alias}
          <br />
          <strong>Index Pattern Name:</strong> {schema['index-pattern-name']}
          <br />
          {schema.info.map((infoLink: string, linkIdx: number) => (
            <EuiLink key={linkIdx} href={infoLink} target="_blank">
              More Info
            </EuiLink>
          ))}
        </EuiText>
        <EuiCodeBlock language="bash" fontSize="m" paddingSize="s" isCopyable>
          {schema.content}
        </EuiCodeBlock>
        <EuiLink href={schema['index-template']} target="_blank">
          Index Template
        </EuiLink>
        <EuiSpacer size="m" />
      </div>
    ));

  const renderIndexPatterns = (indexPatterns: any) => (
    <>
      <EuiText>
        {indexPatterns?.description}
        <br />
        {indexPatterns?.info?.map((infoLink: string, linkIdx: number) => (
          <EuiLink key={linkIdx} href={infoLink} target="_blank">
            More Info
          </EuiLink>
        ))}
      </EuiText>
      <EuiSpacer size="m" />
      <EuiTitle size="s">
        <h3>Index Patterns</h3>
      </EuiTitle>
      <EuiListGroup>
        {indexPatterns?.['index-patterns']?.map((pattern: string, idx: number) => (
          <EuiListGroupItem key={idx} label={pattern} />
        ))}
      </EuiListGroup>
      <EuiButton
        onClick={() => {
          setSaveMessage('Pattern created successfully');
          setTimeout(() => setSaveMessage(null), 3000);
        }}
      >
        Create Pattern
      </EuiButton>
      {saveMessage && (
        <EuiText color="secondary">
          <p>{saveMessage}</p>
        </EuiText>
      )}
      <EuiSpacer size="m" />
      <EuiButton onClick={onMoveToQueryData}>Move to Query and Analyze Data</EuiButton>
    </>
  );

  const tabs = [
    {
      id: 'workflow_tab',
      name: 'Workflow',
      content: (
        <div>
          <EuiComboBox
            placeholder="Search and select a label..."
            singleSelection={{ asPlainText: true }}
            options={labelsOptions}
            selectedOptions={selectedLabel ? [{ label: selectedLabel }] : []}
            onChange={onLabelChange}
            style={{ marginBottom: '20px' }}
          />
          <EuiTitle size="m">
            <h2>Getting Started Workflow</h2>
          </EuiTitle>
          {renderSteps(gettingStarted?.workflows?.[0]?.steps || [])}
          <EuiButton
            onClick={() => {
              setSelectedTabId('schema_tab');
              window.scrollTo(0, 0);
            }}
          >
            Go to Schema
          </EuiButton>
        </div>
      ),
    },
    {
      id: 'schema_tab',
      name: 'Schema',
      content: (
        <div>
          <EuiTitle size="m">
            <h2>Schema</h2>
          </EuiTitle>
          {renderSchema(gettingStarted?.schema || [])}
          <EuiButton
            onClick={() => {
              setSelectedTabId('index_patterns_tab');
              window.scrollTo(0, 0);
            }}
          >
            Go to Index Patterns
          </EuiButton>
        </div>
      ),
    },
    {
      id: 'index_patterns_tab',
      name: 'Index Patterns',
      content: (
        <div>
          <EuiTitle size="m">
            <h2>Index Patterns</h2>
          </EuiTitle>
          {renderIndexPatterns(gettingStarted?.['index-patterns'] || {})}
        </div>
      ),
    },
  ];

  const onTabClick = (tab) => {
    setSelectedTabId(tab.id);
  };

  const renderContent = () => {
    if (!gettingStarted) {
      return (
        <EuiText>
          <h3>Select a collection method first</h3>
          <p>Please select a collection method to view data shipment information.</p>
        </EuiText>
      );
    }

    return (
      <EuiTabbedContent
        tabs={tabs}
        selectedTab={tabs.find((tab) => tab.id === selectedTabId)}
        onTabClick={onTabClick}
      />
    );
  };

  return (
    <EuiAccordion
      id="collect-and-ship-data"
      buttonContent="Collect & Ship Data"
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel>
        <EuiText>
          <h2>Collect Your Data</h2>
        </EuiText>
        <EuiSpacer size="m" />
        <EuiText>Select a collection method</EuiText>
        <EuiSpacer size="s" />
        <EuiFlexGroup gutterSize="l" style={{ maxWidth: '30rem' }}>
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="Structured"
              description="Structured data collection methods"
              onClick={() => handleCollectionMethodChange('Structured')}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="Unstructured"
              description="Unstructured data collection methods"
              onClick={() => handleCollectionMethodChange('Unstructured')}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="Upload File"
              description="Upload a data file"
              onClick={() => handleCollectionMethodChange('Upload File')}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        {renderSpecificMethodDropdown()}
        <EuiSpacer size="l" />
        {selectedTechnology && gettingStarted && renderContent()}
      </EuiPanel>
    </EuiAccordion>
  );
};
