/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  EuiAccordion,
  EuiPanel,
  EuiTitle,
  EuiText,
  EuiSpacer,
  EuiCodeBlock,
  EuiLink,
  EuiComboBox,
  EuiTabbedContent,
  EuiButton,
  EuiListGroup,
  EuiListGroupItem,
} from '@elastic/eui';
import otelJson from './OTEL.json';

export const DataShipment: React.FC<DataShipmentProps> = ({
  isOpen,
  onToggle,
  selectedTechnology,
  onMoveToQueryData,
}) => {
  const [gettingStarted, setGettingStarted] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState('');
  const [labelsOptions, setLabelsOptions] = useState([]);
  const [selectedTabId, setSelectedTabId] = useState('workflow_tab');
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    if (selectedTechnology === 'OTEL' && otelJson && otelJson['getting-started']) {
      setGettingStarted(otelJson['getting-started']);
      const labels = otelJson['getting-started'].workflows[0].steps.map((step: any) => ({
        label: step.label || step.name,
        value: step.name.replace(/\s/g, '-'),
      }));
      setLabelsOptions(labels);
      setError(null);
    } else {
      setGettingStarted(null);
      setError('Selected collection method not supported or data not found');
    }
  }, [selectedTechnology]);

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
        {indexPatterns.description}
        <br />
        {indexPatterns.info.map((infoLink: string, linkIdx: number) => (
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
        {indexPatterns['index-patterns'].map((pattern: string, idx: number) => (
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
      <EuiButton onClick={onMoveToQueryData}>Move to Query Data</EuiButton>
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
          {gettingStarted && gettingStarted.workflows
            ? renderSteps(gettingStarted.workflows[0].steps)
            : null}
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
          {gettingStarted && gettingStarted.schema ? renderSchema(gettingStarted.schema) : null}
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
          {gettingStarted && gettingStarted['index-patterns']
            ? renderIndexPatterns(gettingStarted['index-patterns'])
            : null}
        </div>
      ),
    },
  ];

  const onTabClick = (tab) => {
    setSelectedTabId(tab.id);
  };

  const renderContent = () => {
    if (!selectedTechnology) {
      return (
        <EuiText color="danger">
          <p>Please select a collection method first to see steps.</p>
        </EuiText>
      );
    }

    if (error) {
      return (
        <EuiText color="danger">
          <h3>Error</h3>
          <p>{error}</p>
        </EuiText>
      );
    }

    if (gettingStarted) {
      return (
        <EuiTabbedContent
          tabs={tabs}
          selectedTab={tabs.find((tab) => tab.id === selectedTabId)}
          onTabClick={onTabClick}
        />
      );
    }

    return (
      <EuiText>
        <h3>Select a Technology</h3>
        <p>Please select a collection method to view data shipment information.</p>
      </EuiText>
    );
  };

  return (
    <EuiAccordion
      id="steps"
      buttonContent={selectedTechnology ? `Steps: ${selectedTechnology}` : 'Steps'}
      paddingSize="m"
      forceState={isOpen ? 'open' : 'closed'}
      onToggle={onToggle}
    >
      <EuiPanel style={{ maxWidth: '1000px' }}>{renderContent()}</EuiPanel>
    </EuiAccordion>
  );
};
