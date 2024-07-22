/*
 * Copyright OpenSearch Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  EuiAccordion,
  EuiButton,
  EuiCard,
  EuiCodeBlock,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiListGroup,
  EuiListGroupItem,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiTabbedContent,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import React, { useEffect, useState } from 'react';

import csvFileJson from '../getting_started_artifacts/csv_file/csv_file-1.0.0.json';
import golangClientJson from '../getting_started_artifacts/golang_client/golang_client-1.0.0.json';
import otelJson from '../getting_started_artifacts/otel-services/otel-services-1.0.0.json';
import pythonJson from '../getting_started_artifacts/python_client/python_client-1.0.0.json';
import nginxJson from '../getting_started_artifacts/nginx/nginx-1.0.0.json';

import { IntegrationCards } from './getting_started_integrationCards';
import { fetchDashboardIds, uploadAssets } from './utils';

interface CollectAndShipDataProps {
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  selectedTechnology: string;
  onMoveToQueryData: (indexPatterns: string[]) => void;
  onSelectSource: (source: string) => void;
}

export const CollectAndShipData: React.FC<CollectAndShipDataProps> = ({
  isOpen,
  onToggle,
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
  const [selectedWorkflow, setSelectedWorkflow] = useState('');
  const [firstWorkflow, setFirstWorkflow] = useState<string>('');
  const [secondWorkflow, setSecondWorkflow] = useState<string>('');
  const [indexPatterns, setIndexPatterns] = useState<string[]>([]);

  const technologyJsonMap: Record<string, any> = {
    OTEL: otelJson,
    CSV: csvFileJson,
    Golang: golangClientJson,
    Python: pythonJson,
    Nginx: nginxJson,
  };

  useEffect(() => {
    if (specificMethod) {
      const json = technologyJsonMap[specificMethod];
      if (json && json['getting-started']) {
        const workflows = json['getting-started'].workflows;
        if (workflows && workflows.length >= 2) {
          setFirstWorkflow(workflows[0].name);
          setSecondWorkflow(workflows[1].name);
        }
        const workflowData = workflows.find((workflow: any) => workflow.name === selectedWorkflow);
        setGettingStarted(workflowData || null);
        const labels =
          workflowData?.steps?.map((step: any) => ({
            label: step.label || step.name,
            value: step.name.replace(/\s/g, '-'),
          })) || [];
        setLabelsOptions(labels);
      } else {
        setGettingStarted(null);
      }
    } else {
      setGettingStarted(null);
    }
  }, [specificMethod, selectedWorkflow]);

  const handleCollectionMethodChange = (value: string) => {
    setCollectionMethod(value);
    setSpecificMethod('');
    setSelectedWorkflow('');
    setGettingStarted(null);
  };

  const handleSpecificMethodChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedMethod = event.target.value;
    setSpecificMethod(selectedMethod);
    onSelectSource(selectedMethod);
    setSelectedLabel('');
    setSelectedWorkflow('');
    setGettingStarted(null);
  };

  const handleWorkflowChange = (workflow: string) => {
    setSelectedWorkflow(workflow);
    setSelectedTabId('workflow_tab');
  };

  const renderSpecificMethodDropdown = () => {
    if (!collectionMethod) return null;

    let options = [];
    if (collectionMethod === 'Configure collectors') {
      options = [
        { value: 'OTEL', text: 'Open Telemetry (structured)' },
        { value: 'vpc-flow', text: 'VPC Flow (structured)' },
        { value: 'Nginx', text: 'Nginx (structured)' },
        { value: 'Java', text: 'Java (unstructured)' },
        { value: 'Python', text: 'Python (unstructured)' },
        { value: 'Golang', text: 'Golang (unstructured)' },
      ];
    } else if (collectionMethod === 'Upload a file CSV or JSON') {
      options = [
        { value: 'CSV', text: 'Fluent Bit' },
        { value: 'Data Prepper', text: 'Data Prepper' },
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

  const renderSteps = (workflow: any) => (
    <div>
      <EuiText>
        <h2>{workflow.name} Workflow</h2>
        <p>{workflow.description}</p>
        {workflow.info && (
          <EuiLink href={workflow.info} target="_blank">
            More Info
          </EuiLink>
        )}
        {workflow.types && <p>Types: {workflow.types.join(', ')}</p>}
      </EuiText>
      <EuiSpacer size="m" />
      {workflow.steps.map((step: any, index: number) => (
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
              {step['input-params'].map((param: any, idx: number) => (
                <EuiText key={idx}>
                  <strong>{param.name}:</strong> {param.description} ({param.type})
                </EuiText>
              ))}
            </div>
          )}
          {step.info &&
            step.info.map((link: string, linkIndex: number) => (
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
      ))}
    </div>
  );

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

    const renderIndex = (indexPatterns: any) => (
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
          {indexPatterns?.['index-patterns-name']?.map((pattern: string, idx: number) => (
            <EuiListGroupItem key={idx} label={pattern} />
          ))}
        </EuiListGroup>
        <EuiButton
          onClick={async () => {
            await uploadAssets(specificMethod);
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
        <EuiButton onClick={() => onMoveToQueryData(indexPatterns?.['index-patterns-name'] || [])}>
          Move to Query and Analyze Data
        </EuiButton>
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
          {gettingStarted && renderSteps(gettingStarted)}
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
          {renderSchema(
            technologyJsonMap[specificMethod]?.['getting-started']?.schema ||
              technologyJsonMap[specificMethod]?.schema ||
              []
          )}
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
          {renderIndex(
            technologyJsonMap[specificMethod]?.['getting-started']?.['index-patterns'] ||
              technologyJsonMap[specificMethod]?.['index-patterns'] ||
              {}
          )}
        </div>
      ),
    },
  ];

  const onTabClick = (tab: any) => {
    setSelectedTabId(tab.id);
  };

  const renderContent = () => {
    if (!gettingStarted) {
      return (
        <EuiText>
          <h3>No workflow available</h3>
          <p>There is no workflow available for the selected method.</p>
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
              title="Configure collectors"
              description="Configure agents and ingestion pipeline"
              onClick={() => handleCollectionMethodChange('Configure collectors')}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="Upload a file CSV or JSON"
              description="..."
              onClick={() => handleCollectionMethodChange('Upload a file CSV or JSON')}
            />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCard
              layout="vertical"
              title="Use a sample dataset"
              description="Explore with a log dataset"
              onClick={() => handleCollectionMethodChange('Use a sample dataset')}
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />
        {collectionMethod === 'Use a sample dataset' ? (
          <>
            <IntegrationCards />
          </>
        ) : (
          <>
            {renderSpecificMethodDropdown()}
            <EuiSpacer size="s" />
            {specificMethod && (
              <>
                <EuiSpacer size="s" />
                <EuiFlexGroup gutterSize="s" style={{ maxWidth: '20rem' }}>
                  <EuiFlexItem>
                    <EuiButton
                      fill={selectedWorkflow === firstWorkflow}
                      onClick={() => handleWorkflowChange(firstWorkflow)}
                    >
                      QuickStart
                    </EuiButton>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiButton
                      fill={selectedWorkflow === secondWorkflow}
                      onClick={() => handleWorkflowChange(secondWorkflow)}
                    >
                      Connect To a Collector
                    </EuiButton>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </>
            )}
            <EuiSpacer size="l" />
            {selectedWorkflow && renderContent()}
          </>
        )}
      </EuiPanel>
    </EuiAccordion>
  );
};
